import type { EndpointContext, EndpointOptions } from "better-call";
import type z from "zod";
import type { WithMetadata } from "../../types/api";
import type { StorageOptions } from "../../types/options";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { withMetadata } from "./metadata";

/**
 * Configuration for a storage route
 */
export interface RouteConfig<
	O extends StorageOptions,
	TBaseSchema extends z.ZodRawShape,
	TResponseSchema extends z.ZodTypeAny,
	RequireMetadata extends boolean = true,
> {
	/** Route path */
	path: string;
	/** HTTP method */
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	/** Base body schema (without metadata) */
	bodySchema: z.ZodObject<TBaseSchema>;
	/** Output schema for the response */
	outputSchema: TResponseSchema;
	/** Whether this route requires metadata (default: true) */
	requireMetadata?: RequireMetadata;
	/** Route handler */
	handler: (ctx: {
		body: WithMetadata<z.infer<z.ZodObject<TBaseSchema>>, O, RequireMetadata>;
		context: any;
		endpoint: EndpointContext<string, EndpointOptions, any>;
	}) => Promise<z.output<TResponseSchema>>;
}

/**
 * Creates a storage route with automatic metadata handling
 *
 * @example
 * ```ts
 * const upload = createRoute({
 *   path: "/upload",
 *   method: "POST",
 *   bodySchema: z.object({ file: z.instanceof(File) }),
 *   outputSchema: z.object({ uploadUrl: z.string() }),
 *   requireMetadata: true, // metadata required
 *   handler: async ({ body, context }) => {
 *     const { file } = body;
 *     const metadata = body.metadata; // typed correctly
 *     // ...
 *   }
 * });
 * ```
 */
export function createRoute<
	O extends StorageOptions,
	TBaseSchema extends z.ZodRawShape,
	TResponseSchema extends z.ZodTypeAny,
	RequireMetadata extends boolean = true,
>(
	options: O,
	config: RouteConfig<O, TBaseSchema, TResponseSchema, RequireMetadata>,
) {
	const {
		path,
		method,
		bodySchema,
		outputSchema,
		requireMetadata = true as RequireMetadata,
		handler,
	} = config;

	const finalBodySchema = withMetadata(
		bodySchema,
		options.metadataSchema,
		requireMetadata,
	);

	return createStorageEndpoint(
		path,
		{
			method,
			body: finalBodySchema as any,
		} as EndpointOptions,
		async (ctx) => {
			const result = await handler({
				body: ctx.body,
				context: ctx.context as any,
				endpoint: ctx as EndpointContext<string, EndpointOptions, any>,
			});

			const parsed = await outputSchema.safeParseAsync(result);
			if (!parsed.success) {
				const message = "Invalid response from route handler.";
				throw ctx.error(500, {
					message,
					error: {
						code: "INVALID_RESPONSE",
						message,
						details: parsed.error.issues,
					},
				});
			}

			return parsed.data;
		},
	);
}
