import { describe, expect, it, vi } from "vitest";
import type { FileInfo } from "../../types/file";
import type {
	ContentValidationContext,
	ContentValidator,
} from "../../types/validation";
import {
	combineValidators,
	createContentTypeValidator,
	createExtensionValidator,
	createFilenamePatternValidator,
	createMaxSizeValidator,
	createMinSizeValidator,
	createValidator,
	runContentValidators,
} from "./index";

const createFileInfo = (overrides: Partial<FileInfo> = {}): FileInfo => ({
	name: "test-file.jpg",
	size: 1024,
	contentType: "image/jpeg",
	...overrides,
});

const createContext = <T = unknown>(
	fileInfo: Partial<FileInfo> = {},
	metadata: T = {} as T,
): ContentValidationContext<T> => ({
	fileInfo: createFileInfo(fileInfo),
	metadata,
});

describe("runContentValidators", () => {
	it("should return valid when no validators are provided", async () => {
		const result = await runContentValidators({
			validators: [],
			context: createContext(),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should return valid when all validators pass", async () => {
		const validators: ContentValidator[] = [
			() => ({ valid: true }),
			() => ({ valid: true }),
			() => ({ valid: true }),
		];

		const result = await runContentValidators({
			validators,
			context: createContext(),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should return failure on first failing validator", async () => {
		const validators: ContentValidator[] = [
			() => ({ valid: true }),
			() => ({ valid: false, reason: "Second validator failed" }),
			() => ({ valid: false, reason: "Third validator failed" }),
		];

		const result = await runContentValidators({
			validators,
			context: createContext(),
		});

		expect(result).toEqual({
			valid: false,
			failure: {
				validatorIndex: 1,
				reason: "Second validator failed",
			},
		});
	});

	it("should include validator name in failure when using named validator", async () => {
		const validators = [
			{ name: "first-validator", validate: () => ({ valid: true }) },
			{
				name: "quota-check",
				validate: () => ({ valid: false, reason: "Quota exceeded" }),
			},
		];

		const result = await runContentValidators({
			validators,
			context: createContext(),
		});

		expect(result).toEqual({
			valid: false,
			failure: {
				validatorName: "quota-check",
				validatorIndex: 1,
				reason: "Quota exceeded",
			},
		});
	});

	it("should support async validators", async () => {
		const asyncValidator: ContentValidator = async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return { valid: true };
		};

		const result = await runContentValidators({
			validators: [asyncValidator],
			context: createContext(),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should handle async validator failure", async () => {
		const asyncValidator: ContentValidator = async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return { valid: false, reason: "Async check failed" };
		};

		const result = await runContentValidators({
			validators: [asyncValidator],
			context: createContext(),
		});

		expect(result).toEqual({
			valid: false,
			failure: {
				validatorIndex: 0,
				reason: "Async check failed",
			},
		});
	});

	it("should handle validator timeout", async () => {
		const slowValidator: ContentValidator = async () => {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return { valid: true };
		};

		const result = await runContentValidators({
			validators: [slowValidator],
			context: createContext(),
			timeoutMs: 10,
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toContain("timed out");
	});

	it("should handle validator that throws an error", async () => {
		const throwingValidator: ContentValidator = () => {
			throw new Error("Unexpected error in validator");
		};

		const result = await runContentValidators({
			validators: [throwingValidator],
			context: createContext(),
		});

		expect(result).toEqual({
			valid: false,
			failure: {
				validatorIndex: 0,
				reason: "Unexpected error in validator",
			},
		});
	});

	it("should pass context to validators", async () => {
		const mockValidator = vi.fn().mockReturnValue({ valid: true });
		const fileInfo = createFileInfo({ name: "special.pdf", size: 2048 });
		const metadata = { userId: "123" };

		await runContentValidators({
			validators: [mockValidator],
			context: { fileInfo, metadata },
		});

		expect(mockValidator).toHaveBeenCalledWith({
			fileInfo,
			metadata,
		});
	});

	it("should run validators sequentially", async () => {
		const order: number[] = [];

		const createOrderedValidator =
			(index: number): ContentValidator =>
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				order.push(index);
				return { valid: true };
			};

		await runContentValidators({
			validators: [
				createOrderedValidator(1),
				createOrderedValidator(2),
				createOrderedValidator(3),
			],
			context: createContext(),
		});

		expect(order).toEqual([1, 2, 3]);
	});
});

describe("createValidator", () => {
	it("should create a named validator", () => {
		const validator = createValidator("test-validator", () => ({ valid: true }));

		expect(validator.name).toBe("test-validator");
		expect(typeof validator.validate).toBe("function");
	});

	it("should work with runContentValidators", async () => {
		const validator = createValidator("size-check", (ctx) => {
			if (ctx.fileInfo.size > 1000) {
				return { valid: false, reason: "Too large" };
			}
			return { valid: true };
		});

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 2000 }),
		});

		expect(result).toEqual({
			valid: false,
			failure: {
				validatorName: "size-check",
				validatorIndex: 0,
				reason: "Too large",
			},
		});
	});
});

describe("createMaxSizeValidator", () => {
	it("should pass when file is within size limit", async () => {
		const validator = createMaxSizeValidator(2048);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 1024 }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should pass when file is exactly at size limit", async () => {
		const validator = createMaxSizeValidator(1024);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 1024 }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should fail when file exceeds size limit", async () => {
		const validator = createMaxSizeValidator(1024);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 2048 }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorName).toBe("max-file-size");
		expect(result.failure?.reason).toContain("2048");
		expect(result.failure?.reason).toContain("1024");
	});
});

describe("createMinSizeValidator", () => {
	it("should pass when file meets minimum size", async () => {
		const validator = createMinSizeValidator(512);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 1024 }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should pass when file is exactly at minimum size", async () => {
		const validator = createMinSizeValidator(1024);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 1024 }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should fail when file is below minimum size", async () => {
		const validator = createMinSizeValidator(2048);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ size: 1024 }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorName).toBe("min-file-size");
		expect(result.failure?.reason).toContain("1024");
		expect(result.failure?.reason).toContain("2048");
	});
});

describe("createContentTypeValidator", () => {
	it("should pass for exact content type match", async () => {
		const validator = createContentTypeValidator(["image/jpeg", "image/png"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ contentType: "image/jpeg" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should pass for wildcard content type match", async () => {
		const validator = createContentTypeValidator(["image/*"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ contentType: "image/webp" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should be case-insensitive", async () => {
		const validator = createContentTypeValidator(["IMAGE/JPEG"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ contentType: "image/jpeg" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should fail for non-matching content type", async () => {
		const validator = createContentTypeValidator(["image/jpeg", "image/png"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ contentType: "application/pdf" }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorName).toBe("content-type");
		expect(result.failure?.reason).toContain("application/pdf");
	});
});

describe("createExtensionValidator", () => {
	it("should pass for allowed extension", async () => {
		const validator = createExtensionValidator(["jpg", "png", "gif"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "photo.jpg" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should handle extensions with leading dot", async () => {
		const validator = createExtensionValidator([".jpg", ".png"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "photo.png" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should be case-insensitive", async () => {
		const validator = createExtensionValidator(["JPG", "PNG"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "photo.jpg" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should fail for disallowed extension", async () => {
		const validator = createExtensionValidator(["jpg", "png"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "document.pdf" }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorName).toBe("file-extension");
		expect(result.failure?.reason).toContain("pdf");
	});

	it("should fail for file without extension", async () => {
		const validator = createExtensionValidator(["jpg", "png"]);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "noextension" }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toContain("no extension");
	});
});

describe("createFilenamePatternValidator", () => {
	it("should pass when filename matches pattern", async () => {
		const validator = createFilenamePatternValidator(/^[a-z0-9_]+\.[a-z]+$/i);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "valid_file123.jpg" }),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should fail when filename does not match pattern", async () => {
		const validator = createFilenamePatternValidator(/^[a-z0-9]+\.jpg$/);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "file with spaces.jpg" }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorName).toBe("filename-pattern");
	});

	it("should use custom error message when provided", async () => {
		const customMessage = "Filename must be alphanumeric only";
		const validator = createFilenamePatternValidator(
			/^[a-z0-9]+$/,
			customMessage,
		);

		const result = await runContentValidators({
			validators: [validator],
			context: createContext({ name: "invalid!file" }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toBe(customMessage);
	});
});

describe("combineValidators", () => {
	it("should pass when all combined validators pass", async () => {
		const combined = combineValidators("image-upload", [
			createMaxSizeValidator(5 * 1024 * 1024),
			createContentTypeValidator(["image/*"]),
			createExtensionValidator(["jpg", "png", "gif"]),
		]);

		const result = await runContentValidators({
			validators: [combined],
			context: createContext({
				name: "photo.jpg",
				size: 1024,
				contentType: "image/jpeg",
			}),
		});

		expect(result).toEqual({ valid: true });
	});

	it("should fail when any combined validator fails", async () => {
		const combined = combineValidators("image-upload", [
			createMaxSizeValidator(512),
			createContentTypeValidator(["image/*"]),
		]);

		const result = await runContentValidators({
			validators: [combined],
			context: createContext({ size: 1024 }),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorName).toBe("image-upload");
	});

	it("should preserve the combined validator name", async () => {
		const combined = combineValidators("strict-image-rules", [
			() => ({ valid: false, reason: "Always fails" }),
		]);

		const result = await runContentValidators({
			validators: [combined],
			context: createContext(),
		});

		expect(result.failure?.validatorName).toBe("strict-image-rules");
	});
});

describe("typed metadata validators", () => {
	type UserMetadata = {
		userId: string;
		uploadLimit: number;
	};

	it("should receive typed metadata in validator", async () => {
		const validator = createValidator<UserMetadata>("user-quota", (ctx) => {
			if (ctx.fileInfo.size > ctx.metadata.uploadLimit) {
				return {
					valid: false,
					reason: `User ${ctx.metadata.userId} exceeded upload limit`,
				};
			}
			return { valid: true };
		});

		const result = await runContentValidators<UserMetadata>({
			validators: [validator],
			context: {
				fileInfo: createFileInfo({ size: 2000 }),
				metadata: { userId: "user-123", uploadLimit: 1000 },
			},
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toContain("user-123");
	});
});

describe("edge cases", () => {
	it("should handle empty string reason gracefully", async () => {
		const validator: ContentValidator = () => ({ valid: false, reason: "" });

		const result = await runContentValidators({
			validators: [validator],
			context: createContext(),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toBe("");
	});

	it("should handle validator returning promise that rejects", async () => {
		const validator: ContentValidator = () =>
			Promise.reject(new Error("Rejected"));

		const result = await runContentValidators({
			validators: [validator],
			context: createContext(),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toBe("Rejected");
	});

	it("should handle non-Error throws", async () => {
		const validator: ContentValidator = () => {
			throw "string error";
		};

		const result = await runContentValidators({
			validators: [validator],
			context: createContext(),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.reason).toBe("Validator threw an error");
	});

	it("should handle mixed sync and async validators", async () => {
		const validators: ContentValidator[] = [
			() => ({ valid: true }),
			async () => ({ valid: true }),
			() => ({ valid: true }),
			async () => ({ valid: false, reason: "Async failure" }),
		];

		const result = await runContentValidators({
			validators,
			context: createContext(),
		});

		expect(result.valid).toBe(false);
		expect(result.failure?.validatorIndex).toBe(3);
	});
});
