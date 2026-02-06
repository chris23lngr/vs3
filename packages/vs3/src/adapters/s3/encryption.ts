import { createHash } from "node:crypto";
import type { S3Encryption } from "../../types/encryption";

export type S3EncryptionHeaders = Record<string, string>;

export type S3EncryptionConfig = {
	headers?: S3EncryptionHeaders;
	input?: {
		ServerSideEncryption?: "AES256" | "aws:kms";
		SSEKMSKeyId?: string;
		SSECustomerAlgorithm?: "AES256";
		SSECustomerKey?: string;
		SSECustomerKeyMD5?: string;
	};
};

const SERVER_SIDE_ENCRYPTION_HEADER = "x-amz-server-side-encryption";
const KMS_KEY_ID_HEADER = "x-amz-server-side-encryption-aws-kms-key-id";
const SSE_C_ALGORITHM_HEADER =
	"x-amz-server-side-encryption-customer-algorithm";
const SSE_C_KEY_HEADER = "x-amz-server-side-encryption-customer-key";
const SSE_C_KEY_MD5_HEADER = "x-amz-server-side-encryption-customer-key-MD5";

function buildSseS3Config(): S3EncryptionConfig {
	return {
		headers: {
			[SERVER_SIDE_ENCRYPTION_HEADER]: "AES256",
		},
		input: {
			ServerSideEncryption: "AES256",
		},
	};
}

function buildSseKmsConfig(keyId?: string): S3EncryptionConfig {
	const headers: S3EncryptionHeaders = {
		[SERVER_SIDE_ENCRYPTION_HEADER]: "aws:kms",
	};

	if (keyId) {
		headers[KMS_KEY_ID_HEADER] = keyId;
	}

	return {
		headers,
		input: {
			ServerSideEncryption: "aws:kms",
			SSEKMSKeyId: keyId,
		},
	};
}

function resolveCustomerKeyMd5(
	customerKey: string,
	customerKeyMd5: string | undefined,
): string {
	if (customerKeyMd5 && customerKeyMd5.trim().length > 0) {
		return customerKeyMd5;
	}

	try {
		return createHash("md5")
			.update(Buffer.from(customerKey, "base64"))
			.digest("base64");
	} catch (error) {
		throw new Error(
			"Invalid base64 customer key for SSE-C encryption; unable to compute MD5.",
			{ cause: error },
		);
	}
}

function buildSseCConfig(encryption: Extract<S3Encryption, { type: "SSE-C" }>) {
	const algorithm = encryption.algorithm ?? "AES256";
	const customerKeyMd5 = resolveCustomerKeyMd5(
		encryption.customerKey,
		encryption.customerKeyMd5,
	);
	const headers: S3EncryptionHeaders = {
		[SSE_C_ALGORITHM_HEADER]: algorithm,
		[SSE_C_KEY_HEADER]: encryption.customerKey,
		[SSE_C_KEY_MD5_HEADER]: customerKeyMd5,
	};

	return {
		headers,
		input: {
			SSECustomerAlgorithm: algorithm,
			SSECustomerKey: encryption.customerKey,
			SSECustomerKeyMD5: customerKeyMd5,
		},
	};
}

export function resolveS3EncryptionConfig(
	encryption: S3Encryption | undefined,
): S3EncryptionConfig {
	if (!encryption) {
		return {};
	}

	switch (encryption.type) {
		case "SSE-S3":
			return buildSseS3Config();
		case "SSE-KMS":
			return buildSseKmsConfig(encryption.keyId);
		case "SSE-C":
			return buildSseCConfig(encryption);
	}
}
