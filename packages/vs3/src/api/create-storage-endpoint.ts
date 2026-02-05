import {
	createEndpoint,
	createMiddleware,
	type EndpointContext,
	type EndpointOptions,
	type StrictEndpoint,
} from "better-call";
import z from "zod";
import { runWithEndpointContext } from "../context/endpoint-context";
import { mergeSchema, standardSchemaToZod } from "../core/utils/merge-schema";
import type { StorageContext } from "../types/context";
import type { StandardSchemaV1 } from "../types/standard-schema";

type EndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
> = (context: EndpointContext<Path, Options, StorageContext>) => Promise<R>;

// Utility type to extend a StandardSchema with a metadata field
export type ExtendSchemaWithMetadata<
	BodySchema extends StandardSchemaV1 | undefined,
	MetadataSchema extends StandardSchemaV1,
> = BodySchema extends StandardSchemaV1
	? StandardSchemaV1<
			StandardSchemaV1.InferInput<BodySchema> & {
				metadata: StandardSchemaV1.InferInput<MetadataSchema>;
			},
			StandardSchemaV1.InferOutput<BodySchema> & {
				metadata: StandardSchemaV1.InferOutput<MetadataSchema>;
			}
		>
	: StandardSchemaV1<
			{
				metadata: StandardSchemaV1.InferInput<MetadataSchema>;
			},
			{
				metadata: StandardSchemaV1.InferOutput<MetadataSchema>;
			}
		>;

type ExtendedOptions<
	Options extends EndpointOptions,
	M extends StandardSchemaV1,
> = Options & {
	body: ExtendSchemaWithMetadata<Options["body"], M>;
};

export type StorageEndpointOptions<M extends StandardSchemaV1> =
	EndpointOptions & {
		outputSchema?: StandardSchemaV1;
		metadataSchema: M;
	};

export function createStorageEndpoint<
	Path extends string,
	M extends StandardSchemaV1,
	Options extends StorageEndpointOptions<M>,
	Response extends StandardSchemaV1.InferOutput<
		NonNullable<Options["outputSchema"]>
	>,
>(
	path: Path,
	options: Options & {
		metadataSchema: M;
	},
	handler: EndpointHandler<Path, ExtendedOptions<Options, M>, Response>,
): StrictEndpoint<Path, ExtendedOptions<Options, M>, Response> {
	const { metadataSchema, ...endpointOptions } = options;
	const isUndefinedMetadata =
		metadataSchema instanceof z.ZodUndefined ||
		metadataSchema instanceof z.ZodNever;

	const bodySchema = endpointOptions.body
		? isUndefinedMetadata
			? (endpointOptions.body as z.ZodObject<any>)
			: mergeSchema(endpointOptions.body as z.ZodObject<any>, metadataSchema)
		: isUndefinedMetadata
			? z.object({})
			: z.object({
					metadata: standardSchemaToZod(metadataSchema),
				});

	return createEndpoint(
		path,
		{
			...endpointOptions,
			use: [
				createMiddleware(async () => {
					return {} as StorageContext;
				}),
			],
			body: bodySchema,
		} as unknown as ExtendedOptions<Options, M>,
		async (ctx) => runWithEndpointContext(ctx as any, () => handler(ctx)),
	) as unknown as StrictEndpoint<Path, ExtendedOptions<Options, M>, Response>;
}

export type StorageEndpoint<
	Path extends string,
	M extends StandardSchemaV1,
	Opts extends StorageEndpointOptions<M>,
	R,
> = ReturnType<typeof createStorageEndpoint<Path, M, Opts, R>>;
