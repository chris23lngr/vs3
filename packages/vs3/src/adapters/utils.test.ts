import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageErrorCode } from "../core/error/codes";
import { generateObjectKey } from "./utils";

describe("generateObjectKey", () => {
	beforeEach(() => {
		vi.stubGlobal("crypto", {
			randomUUID: vi.fn().mockReturnValue("uuid-123"),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("creates a key using a uuid, sanitized filename, and extension", () => {
		const key = generateObjectKey({
			name: "My File.png",
			size: 1,
			contentType: "image/png",
		});

		expect(key).toBe("uuid-123-My-File.png");
	});

	it("replaces illegal characters with hyphens", () => {
		const key = generateObjectKey({
			name: "weird@name!!.txt",
			size: 1,
			contentType: "text/plain",
		});

		expect(key).toBe("uuid-123-weird-name--.txt");
	});

	it("preserves the original extension casing", () => {
		const key = generateObjectKey({
			name: "photo.JPEG",
			size: 1,
			contentType: "image/jpeg",
		});

		expect(key).toBe("uuid-123-photo.JPEG");
	});

	it("sanitizes path traversal before generating a key", () => {
		const key = generateObjectKey({
			name: "../private.png",
			size: 1,
			contentType: "image/png",
		});

		expect(key).toBe("uuid-123-private.png");
	});

	it("throws INVALID_FILE_INFO when no extension exists", () => {
		try {
			generateObjectKey({
				name: "no-extension",
				size: 1,
				contentType: "text/plain",
			});
			expect.fail("Expected generateObjectKey to throw");
		} catch (error) {
			expect(error).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		}
	});
});
