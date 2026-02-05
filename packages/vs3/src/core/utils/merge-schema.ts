import z from "zod";
import type { StandardSchemaV1 } from "../../types/standard-schema";

type WithMetadataInput<
	Z extends z.ZodTypeAny,
	S extends StandardSchemaV1,
> = z.input<Z> & { metadata: StandardSchemaV1.InferInput<S> };

type WithMetadataOutput<
	Z extends z.ZodTypeAny,
	S extends StandardSchemaV1,
> = z.output<Z> & { metadata: StandardSchemaV1.InferOutput<S> };

type ZodPath = Array<string | number>;

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"then" in value &&
		typeof (value as PromiseLike<unknown>).then === "function"
	);
}

function toZodPath(
	path?: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>,
): ZodPath | undefined {
	if (!path || path.length === 0) {
		return undefined;
	}
	return path.map((segment) => {
		const key =
			typeof segment === "object" && segment !== null && "key" in segment
				? (segment as StandardSchemaV1.PathSegment).key
				: segment;
		if (typeof key === "symbol") {
			return key.toString();
		}
		return key as string | number;
	});
}

function addIssues(
	ctx: z.RefinementCtx,
	issues: ReadonlyArray<StandardSchemaV1.Issue>,
) {
	for (const issue of issues) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: issue.message,
			path: toZodPath(issue.path),
		});
	}
}

/**
 * Create a Zod schema that validates values using a StandardSchemaV1.
 * Uses sync or async validation depending on the StandardSchemaV1 implementation.
 * For async validation, use `parseAsync`/`safeParseAsync`.
 */
export function standardSchemaToZod<S extends StandardSchemaV1>(
	standardSchema: S,
): z.ZodType<StandardSchemaV1.InferOutput<S>, StandardSchemaV1.InferInput<S>> {
	const schema = z.any().superRefine((value, ctx) => {
		try {
			const result = standardSchema["~standard"].validate(value);
			if (isThenable(result)) {
				return Promise.resolve(result)
					.then((asyncResult) => {
						if (asyncResult.issues) {
							addIssues(ctx, asyncResult.issues);
						}
					})
					.catch((error) => {
						const message = error instanceof Error ? error.message : "Unknown error";
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message,
						});
					});
			}
			if (result.issues) {
				addIssues(ctx, result.issues);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message,
			});
		}
	});

	return schema as unknown as z.ZodType<
		StandardSchemaV1.InferOutput<S>,
		StandardSchemaV1.InferInput<S>
	>;
}

/**
 * Extend a Zod object schema with a `metadata` field validated by StandardSchemaV1.
 * The resulting schema preserves the original structure and types.
 */
export function mergeSchema<
	Z extends z.ZodObject<z.ZodRawShape>,
	S extends StandardSchemaV1,
>(
	zodSchema: Z,
	standardSchema: S,
): z.ZodType<WithMetadataOutput<Z, S>, WithMetadataInput<Z, S>> {
	const metadataSchema = standardSchemaToZod(standardSchema);
	const merged = zodSchema
		.extend({
			metadata: metadataSchema,
		})
		.superRefine((value, ctx) => {
			if (value.metadata === undefined) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Required",
					path: ["metadata"],
				});
			}
		});

	return merged as unknown as z.ZodType<
		WithMetadataOutput<Z, S>,
		WithMetadataInput<Z, S>
	>;
}
