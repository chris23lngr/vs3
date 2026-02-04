import z from "zod";
import { StorageErrorCode } from "./codes";

export const errorSchema = z.object({
	origin: z.enum(["client", "server"]),
	message: z.string(),
	code: z.enum(Object.values(StorageErrorCode)),
	details: z.unknown(),
});

export const clientErrorSchema = errorSchema.omit({
	origin: true,
});

export const serverErrorSchema = errorSchema.omit({
	origin: true,
});

export class StorageError extends Error {
	readonly code: StorageErrorCode;
	readonly details: unknown;

	constructor(error: z.infer<typeof errorSchema>) {
		super(error.message);
		this.name = "sdfsdf";
		this.code = error.code;
		this.details = error.details;
	}
}

export class StorageClientError extends StorageError {
	constructor(error: z.infer<typeof clientErrorSchema>) {
		super({
			origin: "client" as const,
			...error,
		});
	}
}

export class StorageServerError extends StorageError {
	constructor(error: z.infer<typeof serverErrorSchema>) {
		super({
			origin: "server" as const,
			...error,
		});
	}
}
