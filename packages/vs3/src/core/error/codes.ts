export enum StorageErrorCode {
	INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
	METADATA_VALIDATION_ERROR = "METADATA_VALIDATION_ERROR",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
	INVALID_FILE_INFO = "INVALID_FILE_INFO",
	FILE_TOO_LARGE = "FILE_TOO_LARGE",
	CONTENT_VALIDATION_ERROR = "CONTENT_VALIDATION_ERROR",
	/** Request signature is missing or malformed */
	SIGNATURE_MISSING = "SIGNATURE_MISSING",
	/** Request signature verification failed */
	SIGNATURE_INVALID = "SIGNATURE_INVALID",
	/** Request timestamp is missing or malformed */
	TIMESTAMP_MISSING = "TIMESTAMP_MISSING",
	/** Request timestamp is outside the acceptable window (replay attack prevention) */
	TIMESTAMP_EXPIRED = "TIMESTAMP_EXPIRED",
	/** Request nonce has already been used (replay attack prevention) */
	NONCE_REUSED = "NONCE_REUSED",
	/** Request nonce is missing when required */
	NONCE_MISSING = "NONCE_MISSING",
	/** Request nonce store is missing while nonce is required */
	NONCE_STORE_MISSING = "NONCE_STORE_MISSING",
	/** Authentication token is missing */
	UNAUTHORIZED = "UNAUTHORIZED",
	/** Authentication token is invalid or expired */
	FORBIDDEN = "FORBIDDEN",
}
