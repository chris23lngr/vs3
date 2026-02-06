import z from "zod";

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
		customerKey: z.string().min(1),
		customerKeyMd5: z.string().min(1).optional(),
		algorithm: z.literal("AES256").optional(),
	}),
]);
