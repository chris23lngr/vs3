import type { EndpointContext, EndpointOptions } from "better-call";
import type z from "zod";
import type { StorageOptions } from "../../types/options";
import { createStorageEndpoint } from "../create-storage-endpoint";
import { withMetadata } from "./metadata";

/**
 * Configuration for a storage route
 */
export interface RouteConfig<TBaseSchema extends z.ZodRawShape, TResponse> {
	/** Route path */
	path: string;
	/** HTTP method */
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	/** Base body schema (without metadata) */
	bodySchema: z.ZodObject<TBaseSchema>;
	/** Whether this route requires metadata (default: true) */
	requireMetadata?: boolean;
	/** Route handler */
	handler: (ctx: {
		body: any;
		context: any;
		endpoint: EndpointContext<string, EndpointOptions, any>;
	}) => Promise<TResponse>;
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
	TResponse,
>(options: O, config: RouteConfig<TBaseSchema, TResponse>) {
	const { path, method, bodySchema, requireMetadata = true, handler } = config;

	const finalBodySchema = withMetadata(bodySchema, options, requireMetadata);

	return createStorageEndpoint(
		path,
		{
			method,
			body: finalBodySchema as any,
		} as EndpointOptions,
		async (ctx) => {
			return handler({
				body: ctx.body,
				context: ctx.context as any,
				endpoint: ctx as EndpointContext<string, EndpointOptions, any>,
			});
		},
	);
}
