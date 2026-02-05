import { describe, expect, it } from "vitest";
import { StorageErrorCode } from "../error/codes";
import {
	getAllowedFileTypesConfigIssue,
	getFileNameValidationIssue,
	getFileTypeValidationIssue,
	getMagicByteLength,
	getObjectKeyValidationIssue,
} from "./file-validator";

describe("file-validator", () => {
	describe("getMagicByteLength", () => {
		it("returns a positive number", () => {
			expect(getMagicByteLength()).toBeGreaterThan(0);
		});
	});

	describe("getAllowedFileTypesConfigIssue", () => {
		it("returns null for undefined allowedFileTypes", () => {
			expect(getAllowedFileTypesConfigIssue(undefined)).toBeNull();
		});

		it("returns issue for empty array", () => {
			const issue = getAllowedFileTypesConfigIssue([]);
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid allowedFileTypes configuration.",
			});
		});

		it("accepts valid MIME types", () => {
			expect(getAllowedFileTypesConfigIssue(["image/png"])).toBeNull();
			expect(getAllowedFileTypesConfigIssue(["image/jpeg"])).toBeNull();
			expect(getAllowedFileTypesConfigIssue(["application/pdf"])).toBeNull();
		});

		it("accepts wildcard MIME patterns", () => {
			expect(getAllowedFileTypesConfigIssue(["image/*"])).toBeNull();
			expect(getAllowedFileTypesConfigIssue(["application/*"])).toBeNull();
		});

		it("accepts valid file extensions", () => {
			expect(getAllowedFileTypesConfigIssue([".png"])).toBeNull();
			expect(getAllowedFileTypesConfigIssue([".jpg"])).toBeNull();
			expect(getAllowedFileTypesConfigIssue(["png"])).toBeNull();
			expect(getAllowedFileTypesConfigIssue(["PDF"])).toBeNull();
		});

		it("accepts mixed MIME types and extensions", () => {
			expect(
				getAllowedFileTypesConfigIssue(["image/png", ".jpg", "application/*"]),
			).toBeNull();
		});

		it("rejects invalid MIME patterns", () => {
			const issue = getAllowedFileTypesConfigIssue(["image/"]);
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid allowedFileTypes configuration.",
			});
		});

		it("rejects MIME pattern with only slash", () => {
			const issue = getAllowedFileTypesConfigIssue(["/"]);
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects empty string entries", () => {
			const issue = getAllowedFileTypesConfigIssue([""]);
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects whitespace-only entries", () => {
			const issue = getAllowedFileTypesConfigIssue(["   "]);
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects extensions with special characters", () => {
			const issue = getAllowedFileTypesConfigIssue([".tar.gz"]);
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});
	});

	describe("getFileNameValidationIssue", () => {
		it("returns null for valid file names", () => {
			expect(getFileNameValidationIssue("photo.png")).toBeNull();
			expect(getFileNameValidationIssue("my-file.jpg")).toBeNull();
			expect(getFileNameValidationIssue("document (1).pdf")).toBeNull();
		});

		it("rejects empty file names", () => {
			const issue = getFileNameValidationIssue("");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid file name.",
			});
		});

		it("rejects whitespace-only file names", () => {
			const issue = getFileNameValidationIssue("   ");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid file name.",
			});
		});

		it("rejects file names with forward slash", () => {
			const issue = getFileNameValidationIssue("path/to/file.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid file name.",
			});
		});

		it("rejects file names with backslash", () => {
			const issue = getFileNameValidationIssue("path\\to\\file.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid file name.",
			});
		});

		it("rejects file names with control characters", () => {
			const issue = getFileNameValidationIssue("file\x00.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid file name.",
			});
		});

		it("rejects file names with newline", () => {
			const issue = getFileNameValidationIssue("file\n.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects file names with tab", () => {
			const issue = getFileNameValidationIssue("file\t.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});
	});

	describe("getObjectKeyValidationIssue", () => {
		it("returns null for valid object keys", () => {
			expect(getObjectKeyValidationIssue("uploads/photo.png")).toBeNull();
			expect(
				getObjectKeyValidationIssue("user-123/documents/file.pdf"),
			).toBeNull();
			expect(getObjectKeyValidationIssue("simple-key")).toBeNull();
		});

		it("rejects empty object keys", () => {
			const issue = getObjectKeyValidationIssue("");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid object key.",
			});
		});

		it("rejects whitespace-only object keys", () => {
			const issue = getObjectKeyValidationIssue("   ");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects object keys with backslashes", () => {
			const issue = getObjectKeyValidationIssue("uploads\\file.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid object key.",
			});
		});

		it("rejects object keys with path traversal (..)", () => {
			const issue = getObjectKeyValidationIssue("uploads/../secret/file.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
				message: "Invalid object key.",
			});
		});

		it("rejects object keys starting with path traversal", () => {
			const issue = getObjectKeyValidationIssue("../secret.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects object keys with single dot segment", () => {
			const issue = getObjectKeyValidationIssue("uploads/./file.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});

		it("rejects object keys with control characters", () => {
			const issue = getObjectKeyValidationIssue("uploads/file\x00.png");
			expect(issue).toMatchObject({
				code: StorageErrorCode.INVALID_FILE_INFO,
			});
		});
	});

	describe("getFileTypeValidationIssue", () => {
		const baseFileInfo = {
			name: "photo.png",
			contentType: "image/png",
			size: 1024,
		};

		describe("when allowedFileTypes is not configured", () => {
			it("returns null for undefined allowedFileTypes", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: undefined,
				});
				expect(issue).toBeNull();
			});

			it("returns null for empty allowedFileTypes array", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: [],
				});
				expect(issue).toBeNull();
			});
		});

		describe("MIME type validation", () => {
			it("accepts matching MIME type", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/png"],
				});
				expect(issue).toBeNull();
			});

			it("accepts wildcard MIME pattern", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/*"],
				});
				expect(issue).toBeNull();
			});

			it("rejects non-matching MIME type", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: { ...baseFileInfo, contentType: "image/jpeg" },
					allowedFileTypes: ["image/png"],
				});
				expect(issue).toMatchObject({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "File type is not allowed.",
				});
			});

			it("is case-insensitive for MIME types", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: { ...baseFileInfo, contentType: "IMAGE/PNG" },
					allowedFileTypes: ["image/png"],
				});
				expect(issue).toBeNull();
			});
		});

		describe("extension validation", () => {
			it("accepts matching extension", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: [".png"],
				});
				expect(issue).toBeNull();
			});

			it("accepts extension without leading dot", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["png"],
				});
				expect(issue).toBeNull();
			});

			it("rejects non-matching extension", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: { ...baseFileInfo, name: "photo.gif" },
					allowedFileTypes: [".png"],
				});
				expect(issue).toMatchObject({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "File extension is not allowed.",
				});
			});

			it("is case-insensitive for extensions", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: { ...baseFileInfo, name: "photo.PNG" },
					allowedFileTypes: [".png"],
				});
				expect(issue).toBeNull();
			});
		});

		describe("jpeg/jpg extension normalization", () => {
			it("treats jpeg and jpg as equivalent when using .jpeg", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "photo.jpg",
						contentType: "image/jpeg",
						size: 1024,
					},
					allowedFileTypes: [".jpeg"],
				});
				expect(issue).toBeNull();
			});

			it("treats jpeg and jpg as equivalent when using .jpg", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "photo.jpeg",
						contentType: "image/jpeg",
						size: 1024,
					},
					allowedFileTypes: [".jpg"],
				});
				expect(issue).toBeNull();
			});
		});

		describe("magic byte validation", () => {
			const pngMagicBytes = new Uint8Array([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
			]);
			const jpegMagicBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
			const gifMagicBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
			const pdfMagicBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
			const webpMagicBytes = new Uint8Array([
				0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
			]);

			it("accepts PNG with valid magic bytes", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/png"],
					fileBytes: pngMagicBytes,
				});
				expect(issue).toBeNull();
			});

			it("accepts JPEG with valid magic bytes and .jpg allowed", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "photo.jpg",
						contentType: "image/jpeg",
						size: 1024,
					},
					allowedFileTypes: [".jpg"],
					fileBytes: jpegMagicBytes,
				});
				expect(issue).toBeNull();
			});

			it("accepts JPEG with valid magic bytes and .jpeg allowed", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "photo.jpeg",
						contentType: "image/jpeg",
						size: 1024,
					},
					allowedFileTypes: [".jpeg"],
					fileBytes: jpegMagicBytes,
				});
				expect(issue).toBeNull();
			});

			it("accepts GIF with valid magic bytes", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "animation.gif",
						contentType: "image/gif",
						size: 1024,
					},
					allowedFileTypes: ["image/gif"],
					fileBytes: gifMagicBytes,
				});
				expect(issue).toBeNull();
			});

			it("accepts PDF with valid magic bytes", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "document.pdf",
						contentType: "application/pdf",
						size: 1024,
					},
					allowedFileTypes: ["application/pdf"],
					fileBytes: pdfMagicBytes,
				});
				expect(issue).toBeNull();
			});

			it("accepts WebP with valid magic bytes", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "image.webp",
						contentType: "image/webp",
						size: 1024,
					},
					allowedFileTypes: ["image/webp"],
					fileBytes: webpMagicBytes,
				});
				expect(issue).toBeNull();
			});

			it("rejects spoofed PNG (JPEG bytes with PNG claims)", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/png"],
					fileBytes: jpegMagicBytes,
				});
				expect(issue).toMatchObject({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "File content type is not allowed.",
				});
			});

			it("rejects spoofed JPEG (PNG bytes claiming to be JPEG)", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "photo.jpg",
						contentType: "image/jpeg",
						size: 1024,
					},
					allowedFileTypes: ["image/jpeg"],
					fileBytes: pngMagicBytes,
				});
				expect(issue).toMatchObject({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "File content type is not allowed.",
				});
			});

			it("skips magic byte validation when fileBytes is undefined", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/png"],
					fileBytes: undefined,
				});
				expect(issue).toBeNull();
			});

			it("skips magic byte validation for unknown file types", () => {
				const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
				const issue = getFileTypeValidationIssue({
					fileInfo: {
						name: "data.bin",
						contentType: "application/octet-stream",
						size: 1024,
					},
					allowedFileTypes: ["application/octet-stream"],
					fileBytes: unknownBytes,
				});
				expect(issue).toBeNull();
			});
		});

		describe("combined MIME and extension validation", () => {
			it("accepts when both MIME and extension are allowed", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/png", ".png"],
				});
				expect(issue).toBeNull();
			});

			it("accepts when only MIME is specified and matches", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: ["image/png", "image/jpeg"],
				});
				expect(issue).toBeNull();
			});

			it("accepts when only extension is specified and matches", () => {
				const issue = getFileTypeValidationIssue({
					fileInfo: baseFileInfo,
					allowedFileTypes: [".png", ".jpg"],
				});
				expect(issue).toBeNull();
			});
		});
	});
});
