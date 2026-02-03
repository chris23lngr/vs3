import type { StandardSchemaV1 } from "../types/standard-schema";

export class MetadataValidationError extends Error {
	readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;

	constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>) {
		super("Metadata validation failed");
		this.name = "MetadataValidationError";
		this.issues = issues;
	}
}

export class StorageClientResponseError extends Error {
	readonly status: number;
	readonly body: unknown;
	readonly statusText?: string;
	readonly url?: string;
	readonly errorCode?: string;
	readonly errorDetails?: unknown;

	constructor(
		status: number,
		body: unknown,
		statusText?: string,
		url?: string,
		errorCode?: string,
		errorDetails?: unknown,
	) {
		super(`Request failed with status ${status}`);
		this.name = "StorageClientResponseError";
		this.status = status;
		this.body = body;
		this.statusText = statusText;
		this.url = url;
		this.errorCode = errorCode;
		this.errorDetails = errorDetails;
	}
}
