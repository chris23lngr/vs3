import z from "zod";

const SSE_C_KEY_LENGTH = 44;
const SSE_C_KEY_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

function isValidSseCustomerKey(value: string): boolean {
	if (value.length !== SSE_C_KEY_LENGTH) {
		return false;
	}

	if (!SSE_C_KEY_REGEX.test(value)) {
		return false;
	}

	return value.endsWith("=") && !value.endsWith("==");
}

export const s3EncryptionSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("SSE-S3"),
	}),
	z.object({
		type: z.literal("SSE-KMS"),
		keyId: z.string().min(1).optional(),
	}),
	z.object({
		type: z.literal("SSE-C"),
		customerKey: z.string().min(1).refine(isValidSseCustomerKey, {
			message: "SSE-C customer key must be a 32-byte base64-encoded string.",
		}),
		customerKeyMd5: z.string().min(1).optional(),
		algorithm: z.literal("AES256").optional(),
	}),
]);
