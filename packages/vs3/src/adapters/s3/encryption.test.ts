import { describe, expect, it } from "vitest";
import { resolveS3EncryptionConfig } from "./encryption";

describe("resolveS3EncryptionConfig", () => {
	it("returns empty config when encryption is undefined", () => {
		expect(resolveS3EncryptionConfig(undefined)).toEqual({});
	});

	it("builds SSE-S3 headers and input", () => {
		const result = resolveS3EncryptionConfig({ type: "SSE-S3" });

		expect(result).toEqual({
			headers: {
				"x-amz-server-side-encryption": "AES256",
			},
			input: {
				ServerSideEncryption: "AES256",
			},
		});
	});

	it("builds SSE-KMS headers and input with key id", () => {
		const result = resolveS3EncryptionConfig({
			type: "SSE-KMS",
			keyId: "kms-key-123",
		});

		expect(result).toEqual({
			headers: {
				"x-amz-server-side-encryption": "aws:kms",
				"x-amz-server-side-encryption-aws-kms-key-id": "kms-key-123",
			},
			input: {
				ServerSideEncryption: "aws:kms",
				SSEKMSKeyId: "kms-key-123",
			},
		});
	});

	it("builds SSE-KMS headers without key id", () => {
		const result = resolveS3EncryptionConfig({ type: "SSE-KMS" });

		expect(result).toEqual({
			headers: {
				"x-amz-server-side-encryption": "aws:kms",
			},
			input: {
				ServerSideEncryption: "aws:kms",
				SSEKMSKeyId: undefined,
			},
		});
	});

	it("builds SSE-C headers and input with defaults", () => {
		const result = resolveS3EncryptionConfig({
			type: "SSE-C",
			customerKey: "base64-key",
		});

		expect(result).toEqual({
			headers: {
				"x-amz-server-side-encryption-customer-algorithm": "AES256",
				"x-amz-server-side-encryption-customer-key": "base64-key",
			},
			input: {
				SSECustomerAlgorithm: "AES256",
				SSECustomerKey: "base64-key",
				SSECustomerKeyMD5: undefined,
			},
		});
	});

	it("builds SSE-C headers and input with md5", () => {
		const result = resolveS3EncryptionConfig({
			type: "SSE-C",
			customerKey: "base64-key",
			customerKeyMd5: "base64-md5",
		});

		expect(result).toEqual({
			headers: {
				"x-amz-server-side-encryption-customer-algorithm": "AES256",
				"x-amz-server-side-encryption-customer-key": "base64-key",
				"x-amz-server-side-encryption-customer-key-MD5": "base64-md5",
			},
			input: {
				SSECustomerAlgorithm: "AES256",
				SSECustomerKey: "base64-key",
				SSECustomerKeyMD5: "base64-md5",
			},
		});
	});
});
