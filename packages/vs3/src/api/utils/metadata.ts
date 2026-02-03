import z from "zod";
import type { StorageOptions } from "../../types/options";
import type { StandardSchemaV1 } from "../../types/standard-schema";

/**
 * Creates a Zod schema that validates using StandardSchemaV1
 */
export function createMetadataValidator<S extends StandardSchemaV1>(
	schema: S,
): z.ZodType<StandardSchemaV1.InferInput<S>> {
	return z.custom(
		(val) => {
			const result = schema["~standard"].validate(val);
			if (result && typeof (result as Promise<unknown>).then === "function") {
				throw new Error(
					"Async metadata validation is not supported in sync parsing.",
				);
			}
			const syncResult = result as StandardSchemaV1.Result<
				StandardSchemaV1.InferInput<S>
			>;
			if (syncResult.issues) {
				throw new Error(syncResult.issues.map((issue) => issue.message).join(", "));
			}
			return true;
		},
		{ message: "Invalid metadata" },
	) as any;
}

export async function validateMetadata<S extends StandardSchemaV1>(
	schema: S,
	input: unknown,
): Promise<
	| { ok: true; value: StandardSchemaV1.InferOutput<S> }
	| { ok: false; issues: ReadonlyArray<StandardSchemaV1.Issue> }
> {
	const result = await schema["~standard"].validate(input, undefined);
	if (result.issues) {
		return { ok: false, issues: result.issues };
	}
	const value =
		(result as StandardSchemaV1.SuccessResult<StandardSchemaV1.InferOutput<S>>)
			.value ?? (input as StandardSchemaV1.InferOutput<S>);
	return { ok: true, value };
}

/**
 * Extends a body schema with metadata field if needed
 * @param baseSchema - The base Zod schema for the route body
 * @param options - Storage options containing metadataSchema
 * @param requireMetadata - Whether this route requires metadata (default: true)
 */
export function withMetadata<T extends z.ZodRawShape, O extends StorageOptions>(
	baseSchema: z.ZodObject<T>,
	options: O,
	requireMetadata = true,
): z.ZodObject<T> | z.ZodObject<T & { metadata: z.ZodType }> {
	if (requireMetadata && options.metadataSchema) {
		return baseSchema.extend({
			metadata: createMetadataValidator(options.metadataSchema),
		} as any);
	}
	return baseSchema;
}

/**
 * Normalize metadata values to strings for adapters.
 */
export function normalizeMetadata(
	input: unknown,
): Record<string, string> | undefined {
	if (input == null) {
		return undefined;
	}
	if (typeof input !== "object" || Array.isArray(input)) {
		throw new Error("Metadata must be an object.");
	}

	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		if (value === undefined) {
			continue;
		}
		if (value instanceof Date) {
			out[key] = value.toISOString();
			continue;
		}

		const valueType = typeof value;
		if (
			valueType === "string" ||
			valueType === "number" ||
			valueType === "boolean" ||
			valueType === "bigint"
		) {
			out[key] = String(value);
			continue;
		}

		try {
			out[key] = JSON.stringify(value);
		} catch {
			throw new Error(`Metadata value for "${key}" is not serializable.`);
		}
	}

	return out;
}
