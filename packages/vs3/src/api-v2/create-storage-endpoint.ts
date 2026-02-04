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
> = (context: EndpointContext<Path, Options, R>) => Promise<R>;

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

type ExtendedOptions<
	Options extends EndpointOptions,
	M extends StandardSchemaV1,
> = Options & {
	body: ExtendSchemaWithMetadata<Options["body"], M>;
};

export function createStorageEndpoint<
	Path extends string,
	Options extends EndpointOptions & { outputSchema?: StandardSchemaV1 },
	M extends StandardSchemaV1,
	Response extends StandardSchemaV1.InferOutput<
		NonNullable<Options["outputSchema"]>
	>,
>(
	path: Path,
	options: Options & {
		metadataSchema: M;
	},
	handler: EndpointHandler<
		Path,
		Options & { body: ExtendSchemaWithMetadata<Options["body"], M> },
		Response
	>,
): StrictEndpoint<
	Path,
	Options & { body: ExtendSchemaWithMetadata<Options["body"], M> },
	Response
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
		} as unknown as Options & {
			body: ExtendSchemaWithMetadata<Options["body"], M>;
		},
		handler,
	) as unknown as StrictEndpoint<
		Path,
		Options & { body: ExtendSchemaWithMetadata<Options["body"], M> },
		any
	>;
}

const testEndpoint = createStorageEndpoint(
	"/test",
	{
		method: "POST",

		body: z.object({
			randomTestField: z.string(),
		}),

		metadataSchema: z.object({
			userId: z.string(),
			age: z.number(),
		}),
		outputSchema: z.object({
			randomTestField: z.string(),
		}),
	},
	async (ctx) => {
		ctx.body.randomTestField;

		return {
			randomTestField: "dsdfsdf",
		};
	},
);

testEndpoint({
	body: {
		randomTestField: "sdfsdf",
		metadata: {
			userId: "dsfsdf",
			age: 123,
		},
	},
}).then((res) => {});
