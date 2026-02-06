export enum StorageErrorCode {
	INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
	METADATA_VALIDATION_ERROR = "METADATA_VALIDATION_ERROR",
	NETWORK_ERROR = "NETWORK_ERROR",
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
	INVALID_FILE_INFO = "INVALID_FILE_INFO",
	FILE_TOO_LARGE = "FILE_TOO_LARGE",
	FILE_TYPE_NOT_ALLOWED = "FILE_TYPE_NOT_ALLOWED",
	INVALID_FILENAME = "INVALID_FILENAME",
	RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
	CONTENT_VALIDATION_ERROR = "CONTENT_VALIDATION_ERROR",
	VALIDATION_ERROR = "VALIDATION_ERROR",
	UPLOAD_FAILED = "UPLOAD_FAILED",
	UPLOAD_TIMEOUT = "UPLOAD_TIMEOUT",
	ADAPTER_ERROR = "ADAPTER_ERROR",
	SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
	QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
	VIRUS_DETECTED = "VIRUS_DETECTED",
	CONTENT_POLICY_VIOLATION = "CONTENT_POLICY_VIOLATION",
	DUPLICATE_FILE = "DUPLICATE_FILE",
	/** Request signature is missing or malformed */
	SIGNATURE_MISSING = "SIGNATURE_MISSING",
	/** Request signature verification failed */
	SIGNATURE_INVALID = "SIGNATURE_INVALID",
	/** Request signature or timestamp has expired */
	SIGNATURE_EXPIRED = "SIGNATURE_EXPIRED",
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
	NOT_FOUND = "NOT_FOUND",
	CONFLICT = "CONFLICT",
	/** A middleware in the chain failed */
	MIDDLEWARE_FAILED = "MIDDLEWARE_FAILED",
	/** Request processing timed out */
	MIDDLEWARE_TIMEOUT = "MIDDLEWARE_TIMEOUT",
}

export type StorageErrorDefinition = {
	code: StorageErrorCode;
	description: string;
	httpStatus: number;
	recoverySuggestion: string;
};

const STORAGE_ERROR_DEFINITIONS: Record<
	StorageErrorCode,
	StorageErrorDefinition
> = {
	[StorageErrorCode.INTERNAL_SERVER_ERROR]: {
		code: StorageErrorCode.INTERNAL_SERVER_ERROR,
		description: "Unexpected server failure.",
		httpStatus: 500,
		recoverySuggestion: "Retry the request or contact support if it persists.",
	},
	[StorageErrorCode.METADATA_VALIDATION_ERROR]: {
		code: StorageErrorCode.METADATA_VALIDATION_ERROR,
		description: "Metadata payload failed validation.",
		httpStatus: 400,
		recoverySuggestion: "Fix metadata fields to match the schema and retry.",
	},
	[StorageErrorCode.NETWORK_ERROR]: {
		code: StorageErrorCode.NETWORK_ERROR,
		description: "Network request failed before completion.",
		httpStatus: 503,
		recoverySuggestion: "Check connectivity and retry with backoff.",
	},
	[StorageErrorCode.UNKNOWN_ERROR]: {
		code: StorageErrorCode.UNKNOWN_ERROR,
		description: "Unexpected error with unknown cause.",
		httpStatus: 500,
		recoverySuggestion: "Retry the request or contact support if it persists.",
	},
	[StorageErrorCode.INVALID_FILE_INFO]: {
		code: StorageErrorCode.INVALID_FILE_INFO,
		description: "File information failed validation.",
		httpStatus: 400,
		recoverySuggestion: "Verify file attributes and retry the upload.",
	},
	[StorageErrorCode.FILE_TOO_LARGE]: {
		code: StorageErrorCode.FILE_TOO_LARGE,
		description: "File exceeds the configured size limit.",
		httpStatus: 413,
		recoverySuggestion: "Reduce the file size or raise the configured limit.",
	},
	[StorageErrorCode.FILE_TYPE_NOT_ALLOWED]: {
		code: StorageErrorCode.FILE_TYPE_NOT_ALLOWED,
		description: "File type is not permitted by configuration.",
		httpStatus: 415,
		recoverySuggestion: "Upload a file that matches the allowed types.",
	},
	[StorageErrorCode.INVALID_FILENAME]: {
		code: StorageErrorCode.INVALID_FILENAME,
		description: "Filename contains invalid characters or format.",
		httpStatus: 400,
		recoverySuggestion: "Rename the file to remove invalid characters or paths.",
	},
	[StorageErrorCode.RATE_LIMIT_EXCEEDED]: {
		code: StorageErrorCode.RATE_LIMIT_EXCEEDED,
		description: "Request rate limit has been exceeded.",
		httpStatus: 429,
		recoverySuggestion: "Wait before retrying or reduce request volume.",
	},
	[StorageErrorCode.CONTENT_VALIDATION_ERROR]: {
		code: StorageErrorCode.CONTENT_VALIDATION_ERROR,
		description: "Content validators rejected the upload.",
		httpStatus: 422,
		recoverySuggestion: "Adjust content to satisfy validation rules.",
	},
	[StorageErrorCode.VALIDATION_ERROR]: {
		code: StorageErrorCode.VALIDATION_ERROR,
		description: "Input or configuration failed validation.",
		httpStatus: 400,
		recoverySuggestion: "Correct the invalid input and retry.",
	},
	[StorageErrorCode.UPLOAD_FAILED]: {
		code: StorageErrorCode.UPLOAD_FAILED,
		description: "Upload failed due to upstream storage error.",
		httpStatus: 502,
		recoverySuggestion: "Retry the upload or check storage availability.",
	},
	[StorageErrorCode.UPLOAD_TIMEOUT]: {
		code: StorageErrorCode.UPLOAD_TIMEOUT,
		description: "Upload timed out before completion.",
		httpStatus: 504,
		recoverySuggestion: "Retry with a smaller file or a longer timeout.",
	},
	[StorageErrorCode.ADAPTER_ERROR]: {
		code: StorageErrorCode.ADAPTER_ERROR,
		description: "Storage adapter failed to complete the operation.",
		httpStatus: 502,
		recoverySuggestion: "Verify adapter configuration and retry.",
	},
	[StorageErrorCode.SERVICE_UNAVAILABLE]: {
		code: StorageErrorCode.SERVICE_UNAVAILABLE,
		description: "Service is temporarily unavailable.",
		httpStatus: 503,
		recoverySuggestion: "Retry later or check service status.",
	},
	[StorageErrorCode.QUOTA_EXCEEDED]: {
		code: StorageErrorCode.QUOTA_EXCEEDED,
		description: "Storage quota has been exceeded.",
		httpStatus: 429,
		recoverySuggestion: "Free space or increase quota before retrying.",
	},
	[StorageErrorCode.VIRUS_DETECTED]: {
		code: StorageErrorCode.VIRUS_DETECTED,
		description: "Upload rejected due to malware detection.",
		httpStatus: 422,
		recoverySuggestion: "Scan the file for malware before retrying.",
	},
	[StorageErrorCode.CONTENT_POLICY_VIOLATION]: {
		code: StorageErrorCode.CONTENT_POLICY_VIOLATION,
		description: "Content violates policy or compliance rules.",
		httpStatus: 403,
		recoverySuggestion: "Remove prohibited content and retry.",
	},
	[StorageErrorCode.DUPLICATE_FILE]: {
		code: StorageErrorCode.DUPLICATE_FILE,
		description: "Duplicate file detected during upload.",
		httpStatus: 409,
		recoverySuggestion: "Upload a different file or enable overwrite.",
	},
	[StorageErrorCode.SIGNATURE_MISSING]: {
		code: StorageErrorCode.SIGNATURE_MISSING,
		description: "Request signature is missing or malformed.",
		httpStatus: 401,
		recoverySuggestion: "Include a valid signature header and retry.",
	},
	[StorageErrorCode.SIGNATURE_INVALID]: {
		code: StorageErrorCode.SIGNATURE_INVALID,
		description: "Request signature verification failed.",
		httpStatus: 401,
		recoverySuggestion: "Recompute the signature and retry the request.",
	},
	[StorageErrorCode.SIGNATURE_EXPIRED]: {
		code: StorageErrorCode.SIGNATURE_EXPIRED,
		description: "Request signature has expired.",
		httpStatus: 401,
		recoverySuggestion: "Generate a new signature and retry quickly.",
	},
	[StorageErrorCode.TIMESTAMP_MISSING]: {
		code: StorageErrorCode.TIMESTAMP_MISSING,
		description: "Request timestamp is missing or malformed.",
		httpStatus: 400,
		recoverySuggestion: "Include a valid timestamp and retry.",
	},
	[StorageErrorCode.TIMESTAMP_EXPIRED]: {
		code: StorageErrorCode.TIMESTAMP_EXPIRED,
		description: "Request timestamp is outside the acceptable time window.",
		httpStatus: 401,
		recoverySuggestion: "Sync the client clock and retry with a new timestamp.",
	},
	[StorageErrorCode.NONCE_REUSED]: {
		code: StorageErrorCode.NONCE_REUSED,
		description: "Request nonce has already been used.",
		httpStatus: 409,
		recoverySuggestion: "Generate a fresh nonce for each request.",
	},
	[StorageErrorCode.NONCE_MISSING]: {
		code: StorageErrorCode.NONCE_MISSING,
		description: "Request nonce is missing when required.",
		httpStatus: 400,
		recoverySuggestion: "Include a nonce value and retry.",
	},
	[StorageErrorCode.NONCE_STORE_MISSING]: {
		code: StorageErrorCode.NONCE_STORE_MISSING,
		description: "Nonce store is missing while nonce is required.",
		httpStatus: 500,
		recoverySuggestion: "Configure a nonce store and retry.",
	},
	[StorageErrorCode.UNAUTHORIZED]: {
		code: StorageErrorCode.UNAUTHORIZED,
		description: "Authentication token is missing.",
		httpStatus: 401,
		recoverySuggestion: "Provide valid authentication credentials.",
	},
	[StorageErrorCode.FORBIDDEN]: {
		code: StorageErrorCode.FORBIDDEN,
		description: "Authentication token is invalid or expired.",
		httpStatus: 403,
		recoverySuggestion: "Refresh credentials or request access.",
	},
	[StorageErrorCode.NOT_FOUND]: {
		code: StorageErrorCode.NOT_FOUND,
		description: "Requested resource could not be found.",
		httpStatus: 404,
		recoverySuggestion: "Verify the resource identifier and retry.",
	},
	[StorageErrorCode.CONFLICT]: {
		code: StorageErrorCode.CONFLICT,
		description: "Request conflicts with existing resource state.",
		httpStatus: 409,
		recoverySuggestion: "Resolve the conflict before retrying.",
	},
	[StorageErrorCode.MIDDLEWARE_FAILED]: {
		code: StorageErrorCode.MIDDLEWARE_FAILED,
		description: "A middleware in the chain failed.",
		httpStatus: 500,
		recoverySuggestion: "Retry or inspect middleware configuration.",
	},
	[StorageErrorCode.MIDDLEWARE_TIMEOUT]: {
		code: StorageErrorCode.MIDDLEWARE_TIMEOUT,
		description: "Middleware execution timed out.",
		httpStatus: 504,
		recoverySuggestion: "Retry or increase middleware timeout.",
	},
};

export function getStorageErrorDefinition(
	code: StorageErrorCode,
): StorageErrorDefinition {
	return STORAGE_ERROR_DEFINITIONS[code];
}

export function listStorageErrorDefinitions(): StorageErrorDefinition[] {
	return Object.values(STORAGE_ERROR_DEFINITIONS);
}
