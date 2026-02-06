import z from "zod";
import { getStorageErrorDefinition, StorageErrorCode } from "./codes";

export const errorSchema = z.object({
	origin: z.enum(["client", "server"]),
	message: z.string(),
	code: z.enum(Object.values(StorageErrorCode)),
	details: z.unknown(),
	httpStatus: z.number().int().optional(),
	recoverySuggestion: z.string().optional(),
});

export const clientErrorSchema = errorSchema.omit({
	origin: true,
});

export const serverErrorSchema = errorSchema.omit({
	origin: true,
});

export class StorageError extends Error {
	readonly origin: "client" | "server";
	readonly code: StorageErrorCode;
	readonly details: unknown;
	readonly httpStatus: number;
	readonly recoverySuggestion: string;

	constructor(error: z.infer<typeof errorSchema>) {
		super(error.message);
		const definition = getStorageErrorDefinition(error.code);
		const fallbackDefinition = getStorageErrorDefinition(
			StorageErrorCode.UNKNOWN_ERROR,
		);
		const resolvedDefinition = definition ?? fallbackDefinition;
		const resolvedCode =
			definition === undefined ? StorageErrorCode.UNKNOWN_ERROR : error.code;
		this.name = "StorageError";
		this.origin = error.origin;
		this.code = resolvedCode;
		this.details = error.details;
		this.httpStatus = error.httpStatus ?? resolvedDefinition.httpStatus;
		this.recoverySuggestion =
			error.recoverySuggestion ?? resolvedDefinition.recoverySuggestion;
	}

	toPayload(): StorageErrorPayload {
		return {
			origin: this.origin,
			message: this.message,
			code: this.code,
			details: this.details,
			httpStatus: this.httpStatus,
			recoverySuggestion: this.recoverySuggestion,
		};
	}
}

export class StorageClientError extends StorageError {
	constructor(error: z.infer<typeof clientErrorSchema>) {
		super({
			origin: "client" as const,
			...error,
		});
		this.name = "StorageClientError";
	}
}

export class StorageServerError extends StorageError {
	constructor(error: z.infer<typeof serverErrorSchema>) {
		super({
			origin: "server" as const,
			...error,
		});
		this.name = "StorageServerError";
	}
}

export type StorageErrorPayload = z.infer<typeof errorSchema>;
