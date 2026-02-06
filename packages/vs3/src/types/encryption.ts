/**
 * Supported S3 server-side encryption options.
 */
export type S3Encryption =
	| {
			/**
			 * Server-side encryption with S3-managed keys.
			 */
			type: "SSE-S3";
	  }
	| {
			/**
			 * Server-side encryption with AWS KMS keys.
			 */
			type: "SSE-KMS";
			/**
			 * Optional KMS key ID or ARN.
			 */
			keyId?: string;
	  }
	| {
			/**
			 * Server-side encryption with customer-provided keys.
			 */
			type: "SSE-C";
			/**
			 * Base64-encoded customer-provided key.
			 */
			customerKey: string;
			/**
			 * Base64-encoded MD5 digest of the customer key.
			 */
			customerKeyMd5?: string;
			/**
			 * Encryption algorithm. Only AES256 is supported by S3.
			 */
			algorithm?: "AES256";
	  };
