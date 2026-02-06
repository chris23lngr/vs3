import { describe, expect, it } from "vitest";
import { StorageErrorCode } from "./codes";
import { StorageClientError, StorageError, StorageServerError } from "./error";

describe("StorageError", () => {
	it("creates error with correct name", () => {
		const error = new StorageError({
			origin: "server",
			message: "Test error",
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: undefined,
		});

		expect(error.name).toBe("StorageError");
	});

	it("creates error with correct message", () => {
		const error = new StorageError({
			origin: "server",
			message: "Test error message",
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: undefined,
		});

		expect(error.message).toBe("Test error message");
	});

	it("creates error with correct code", () => {
		const error = new StorageError({
			origin: "server",
			message: "Test error",
			code: StorageErrorCode.NETWORK_ERROR,
			details: undefined,
		});

		expect(error.code).toBe(StorageErrorCode.NETWORK_ERROR);
	});

	it("creates error with correct details", () => {
		const details = { reason: "Connection timeout" };
		const error = new StorageError({
			origin: "server",
			message: "Network error",
			code: StorageErrorCode.NETWORK_ERROR,
			details,
		});

		expect(error.details).toEqual(details);
	});

	it("populates httpStatus and recoverySuggestion from definitions", () => {
		const error = new StorageError({
			origin: "server",
			message: "File too large",
			code: StorageErrorCode.FILE_TOO_LARGE,
			details: undefined,
		});

		expect(error.httpStatus).toBe(413);
		expect(error.recoverySuggestion).toBe(
			"Reduce the file size or raise the configured limit.",
		);
	});

	it("is an instance of Error", () => {
		const error = new StorageError({
			origin: "server",
			message: "Test error",
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: undefined,
		});

		expect(error).toBeInstanceOf(Error);
	});

	it("is an instance of StorageError", () => {
		const error = new StorageError({
			origin: "server",
			message: "Test error",
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: undefined,
		});

		expect(error).toBeInstanceOf(StorageError);
	});

	it("handles all error codes", () => {
		for (const code of Object.values(StorageErrorCode)) {
			const error = new StorageError({
				origin: "server",
				message: `Test ${code}`,
				code,
				details: undefined,
			});

			expect(error.code).toBe(code);
		}
	});

	it("stores origin field correctly", () => {
		const clientError = new StorageError({
			origin: "client",
			message: "Test",
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: undefined,
		});

		const serverError = new StorageError({
			origin: "server",
			message: "Test",
			code: StorageErrorCode.UNKNOWN_ERROR,
			details: undefined,
		});

		expect(clientError.origin).toBe("client");
		expect(serverError.origin).toBe("server");
	});

	it("returns a standardized payload", () => {
		const error = new StorageError({
			origin: "server",
			message: "Rate limit",
			code: StorageErrorCode.RATE_LIMIT_EXCEEDED,
			details: { remaining: 0 },
		});

		expect(error.toPayload()).toEqual({
			origin: "server",
			message: "Rate limit",
			code: StorageErrorCode.RATE_LIMIT_EXCEEDED,
			details: { remaining: 0 },
			httpStatus: 429,
			recoverySuggestion: "Wait before retrying or reduce request volume.",
		});
	});
});

describe("StorageClientError", () => {
	it("creates client error with correct name", () => {
		const error = new StorageClientError({
			message: "Client error",
			code: StorageErrorCode.INVALID_FILE_INFO,
			details: undefined,
		});

		expect(error.name).toBe("StorageClientError");
	});

	it("creates client error with correct properties", () => {
		const error = new StorageClientError({
			message: "Invalid file",
			code: StorageErrorCode.INVALID_FILE_INFO,
			details: { field: "size" },
		});

		expect(error.message).toBe("Invalid file");
		expect(error.code).toBe(StorageErrorCode.INVALID_FILE_INFO);
		expect(error.details).toEqual({ field: "size" });
	});

	it("is an instance of StorageError", () => {
		const error = new StorageClientError({
			message: "Client error",
			code: StorageErrorCode.INVALID_FILE_INFO,
			details: undefined,
		});

		expect(error).toBeInstanceOf(StorageError);
	});

	it("is an instance of StorageClientError", () => {
		const error = new StorageClientError({
			message: "Client error",
			code: StorageErrorCode.INVALID_FILE_INFO,
			details: undefined,
		});

		expect(error).toBeInstanceOf(StorageClientError);
	});

	it("automatically sets origin to client", () => {
		const error = new StorageClientError({
			message: "Client error",
			code: StorageErrorCode.INVALID_FILE_INFO,
			details: undefined,
		});

		expect(error.origin).toBe("client");
	});
});

describe("StorageServerError", () => {
	it("creates server error with correct name", () => {
		const error = new StorageServerError({
			message: "Server error",
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			details: undefined,
		});

		expect(error.name).toBe("StorageServerError");
	});

	it("creates server error with correct properties", () => {
		const error = new StorageServerError({
			message: "Internal error",
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			details: { stackTrace: "..." },
		});

		expect(error.message).toBe("Internal error");
		expect(error.code).toBe(StorageErrorCode.INTERNAL_SERVER_ERROR);
		expect(error.details).toEqual({ stackTrace: "..." });
	});

	it("is an instance of StorageError", () => {
		const error = new StorageServerError({
			message: "Server error",
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			details: undefined,
		});

		expect(error).toBeInstanceOf(StorageError);
	});

	it("is an instance of StorageServerError", () => {
		const error = new StorageServerError({
			message: "Server error",
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			details: undefined,
		});

		expect(error).toBeInstanceOf(StorageServerError);
	});

	it("automatically sets origin to server", () => {
		const error = new StorageServerError({
			message: "Server error",
			code: StorageErrorCode.INTERNAL_SERVER_ERROR,
			details: undefined,
		});

		expect(error.origin).toBe("server");
	});
});
