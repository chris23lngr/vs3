import {
	createEndpoint,
	type EndpointContext,
	type EndpointOptions,
	type StrictEndpoint,
} from "better-call";
import z from "zod";
import type { StandardSchemaV1 } from "../types/standard-schema";

type EndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
> = (
	context: EndpointContext<Path, Options, { randomNumberField: number }>,
) => Promise<R>;

// Utility type to extend a StandardSchema with a metadata field
type ExtendSchemaWithMetadata<
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

export function createStorageEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	M extends StandardSchemaV1,
>(
	path: Path,
	options: Options & {
		metadataSchema: M;
	},
	handler: EndpointHandler<Path, Options, any>,
): StrictEndpoint<
	Path,
	Options & { body: ExtendSchemaWithMetadata<Options["body"], M> },
	any
> {
	const { metadataSchema, ...endpointOptions } = options;

	const bodySchema = endpointOptions.body
		? (endpointOptions.body as z.ZodObject<any>).extend({
				metadata: metadataSchema,
			})
		: z.object({
				metadata: metadataSchema,
			});

	return createEndpoint(
		path,
		{
			...endpointOptions,
			body: bodySchema,
		} as any,
		handler,
	) as StrictEndpoint<
		Path,
		Options & { body: ExtendSchemaWithMetadata<Options["body"], M> },
		any
	>;
}

const testEndpoint = createStorageEndpoint(
	"/test",
	{
		method: "POST",

		metadataSchema: z.object({
			userId: z.string(),
		}),
	},
	async (ctx) => {
		return {
			randomTestField: ctx.body.randomTestField,
		};
	},
);

testEndpoint({
	body: {
		metadata: {
			userId: "dsfsdf",
		},
	},
});
