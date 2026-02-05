import { describe, expect, it } from "vitest";
import {
	DEFAULT_FALLBACK_FILENAME,
	DEFAULT_MAX_FILENAME_LENGTH,
	sanitize,
	sanitizeFilename,
} from "./filename-sanitizer";

describe("filename-sanitizer", () => {
	describe("sanitizeFilename", () => {
		describe("valid filenames pass through unchanged", () => {
			it("returns valid filename unchanged", () => {
				const result = sanitizeFilename("document.pdf");
				expect(result.sanitized).toBe("document.pdf");
				expect(result.wasModified).toBe(false);
				expect(result.appliedOperations).toEqual([]);
			});

			it("preserves filenames with hyphens and underscores", () => {
				const result = sanitizeFilename("my-file_name.txt");
				expect(result.sanitized).toBe("my-file_name.txt");
				expect(result.wasModified).toBe(false);
			});

			it("preserves filenames with spaces", () => {
				const result = sanitizeFilename("my file name.txt");
				expect(result.sanitized).toBe("my file name.txt");
				expect(result.wasModified).toBe(false);
			});

			it("preserves filenames with numbers", () => {
				const result = sanitizeFilename("file123.txt");
				expect(result.sanitized).toBe("file123.txt");
				expect(result.wasModified).toBe(false);
			});

			it("preserves filenames with parentheses", () => {
				const result = sanitizeFilename("document (1).pdf");
				expect(result.sanitized).toBe("document (1).pdf");
				expect(result.wasModified).toBe(false);
			});
		});

		describe("null byte removal", () => {
			it("removes null bytes from filename", () => {
				const result = sanitizeFilename("file\x00name.txt");
				expect(result.sanitized).toBe("filename.txt");
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("removed_null_bytes");
			});

			it("removes multiple null bytes", () => {
				const result = sanitizeFilename("fi\x00le\x00na\x00me.txt");
				expect(result.sanitized).toBe("filename.txt");
				expect(result.appliedOperations).toContain("removed_null_bytes");
			});

			it("removes null byte at start", () => {
				const result = sanitizeFilename("\x00filename.txt");
				expect(result.sanitized).toBe("filename.txt");
			});

			it("removes null byte at end", () => {
				const result = sanitizeFilename("filename.txt\x00");
				expect(result.sanitized).toBe("filename.txt");
			});
		});

		describe("control character removal", () => {
			it("removes newline characters", () => {
				const result = sanitizeFilename("file\nname.txt");
				expect(result.sanitized).toBe("file_name.txt");
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("removed_control_characters");
			});

			it("removes tab characters", () => {
				const result = sanitizeFilename("file\tname.txt");
				expect(result.sanitized).toBe("file_name.txt");
				expect(result.appliedOperations).toContain("removed_control_characters");
			});

			it("removes carriage return", () => {
				const result = sanitizeFilename("file\rname.txt");
				expect(result.sanitized).toBe("file_name.txt");
			});

			it("removes bell character", () => {
				const result = sanitizeFilename("file\x07name.txt");
				expect(result.sanitized).toBe("file_name.txt");
			});

			it("removes DEL character (0x7F)", () => {
				const result = sanitizeFilename("file\x7Fname.txt");
				expect(result.sanitized).toBe("file_name.txt");
			});

			it("removes multiple control characters", () => {
				const result = sanitizeFilename("a\x01b\x02c\x03d.txt");
				expect(result.sanitized).toBe("a_b_c_d.txt");
			});

			it("uses custom replacement character", () => {
				const result = sanitizeFilename("file\nname.txt", {
					replacementChar: "-",
				});
				expect(result.sanitized).toBe("file-name.txt");
			});
		});

		describe("path separator removal", () => {
			it("removes forward slashes", () => {
				const result = sanitizeFilename("path/to/file.txt");
				expect(result.sanitized).toBe("path_to_file.txt");
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("removed_path_separators");
			});

			it("removes backslashes", () => {
				const result = sanitizeFilename("path\\to\\file.txt");
				expect(result.sanitized).toBe("path_to_file.txt");
				expect(result.appliedOperations).toContain("removed_path_separators");
			});

			it("removes mixed path separators", () => {
				const result = sanitizeFilename("path/to\\file.txt");
				expect(result.sanitized).toBe("path_to_file.txt");
			});

			it("removes leading path separator", () => {
				const result = sanitizeFilename("/file.txt");
				expect(result.sanitized).toBe("file.txt");
			});

			it("removes trailing path separator", () => {
				const result = sanitizeFilename("file.txt/");
				expect(result.sanitized).toBe("file.txt");
			});
		});

		describe("path traversal prevention", () => {
			it("removes double dot sequences", () => {
				const result = sanitizeFilename("..file.txt");
				expect(result.sanitized).toBe("file.txt");
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("removed_path_traversal");
			});

			it("removes multiple consecutive dots", () => {
				const result = sanitizeFilename("file...name.txt");
				expect(result.sanitized).toBe("file.name.txt");
			});

			it("removes triple dots", () => {
				const result = sanitizeFilename("...file.txt");
				expect(result.sanitized).toBe("file.txt");
			});

			it("handles combined path traversal patterns", () => {
				const result = sanitizeFilename("../secret/file.txt");
				expect(result.sanitized).toBe("secret_file.txt");
			});

			it("handles Windows-style path traversal", () => {
				const result = sanitizeFilename("..\\secret\\file.txt");
				expect(result.sanitized).toBe("secret_file.txt");
			});

			it("preserves single leading dot for hidden files", () => {
				const result = sanitizeFilename(".gitignore");
				expect(result.sanitized).toBe(".gitignore");
				expect(result.wasModified).toBe(false);
			});

			it("preserves hidden file with extension", () => {
				const result = sanitizeFilename(".env.local");
				expect(result.sanitized).toBe(".env.local");
				expect(result.wasModified).toBe(false);
			});
		});

		describe("whitespace handling", () => {
			it("trims leading whitespace", () => {
				const result = sanitizeFilename("  file.txt");
				expect(result.sanitized).toBe("file.txt");
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("trimmed_whitespace");
			});

			it("trims trailing whitespace", () => {
				const result = sanitizeFilename("file.txt  ");
				expect(result.sanitized).toBe("file.txt");
				expect(result.appliedOperations).toContain("trimmed_whitespace");
			});

			it("trims both leading and trailing whitespace", () => {
				const result = sanitizeFilename("  file.txt  ");
				expect(result.sanitized).toBe("file.txt");
			});

			it("preserves internal spaces", () => {
				const result = sanitizeFilename("my file name.txt");
				expect(result.sanitized).toBe("my file name.txt");
				expect(result.wasModified).toBe(false);
			});
		});

		describe("length truncation", () => {
			it("truncates filename exceeding max length", () => {
				const longName = `${"a".repeat(300)}.txt`;
				const result = sanitizeFilename(longName);
				expect(result.sanitized.length).toBe(DEFAULT_MAX_FILENAME_LENGTH);
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("truncated_length");
			});

			it("preserves extension when truncating", () => {
				const longName = `${"a".repeat(300)}.pdf`;
				const result = sanitizeFilename(longName);
				expect(result.sanitized).toMatch(/\.pdf$/);
				expect(result.sanitized.length).toBe(DEFAULT_MAX_FILENAME_LENGTH);
			});

			it("respects custom max length", () => {
				const result = sanitizeFilename("longfilename.txt", { maxLength: 10 });
				expect(result.sanitized.length).toBe(10);
				expect(result.sanitized).toBe("longfi.txt");
			});

			it("handles very short max length while preserving extension", () => {
				const result = sanitizeFilename("filename.txt", { maxLength: 5 });
				expect(result.sanitized.length).toBe(5);
				// Extension is preserved when possible, so "f.txt" not "filen"
				expect(result.sanitized).toBe("f.txt");
			});

			it("does not truncate filename under max length", () => {
				const result = sanitizeFilename("short.txt", { maxLength: 100 });
				expect(result.sanitized).toBe("short.txt");
				expect(result.wasModified).toBe(false);
			});

			it("handles filename exactly at max length", () => {
				const filename = `${"a".repeat(251)}.txt`;
				const result = sanitizeFilename(filename);
				expect(result.sanitized).toBe(filename);
				expect(result.wasModified).toBe(false);
			});

			it("uses default max length when maxLength is zero", () => {
				const longName = `${"a".repeat(300)}.txt`;
				const result = sanitizeFilename(longName, { maxLength: 0 });
				expect(result.sanitized.length).toBe(DEFAULT_MAX_FILENAME_LENGTH);
			});

			it("uses default max length when maxLength is negative", () => {
				const longName = `${"a".repeat(300)}.txt`;
				const result = sanitizeFilename(longName, { maxLength: -5 });
				expect(result.sanitized.length).toBe(DEFAULT_MAX_FILENAME_LENGTH);
			});
		});

		describe("fallback filename", () => {
			it("uses default fallback for empty filename", () => {
				const result = sanitizeFilename("");
				expect(result.sanitized).toBe(DEFAULT_FALLBACK_FILENAME);
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("used_fallback");
			});

			it("uses default fallback for whitespace-only filename", () => {
				const result = sanitizeFilename("   ");
				expect(result.sanitized).toBe(DEFAULT_FALLBACK_FILENAME);
				expect(result.appliedOperations).toContain("used_fallback");
			});

			it("uses default fallback when all characters are invalid", () => {
				const result = sanitizeFilename("\x00\x01\x02");
				expect(result.sanitized).toBe(DEFAULT_FALLBACK_FILENAME);
			});

			it("uses custom fallback filename", () => {
				const result = sanitizeFilename("", { fallbackFilename: "unnamed" });
				expect(result.sanitized).toBe("unnamed");
			});

			it("uses fallback for only path separators", () => {
				const result = sanitizeFilename("///");
				expect(result.sanitized).toBe(DEFAULT_FALLBACK_FILENAME);
			});
		});

		describe("replacement character handling", () => {
			it("uses underscore as default replacement", () => {
				const result = sanitizeFilename("file/name.txt");
				expect(result.sanitized).toBe("file_name.txt");
			});

			it("uses custom replacement character", () => {
				const result = sanitizeFilename("file/name.txt", {
					replacementChar: "-",
				});
				expect(result.sanitized).toBe("file-name.txt");
			});

			it("collapses consecutive replacement characters", () => {
				const result = sanitizeFilename("a//b\\\\c.txt");
				expect(result.sanitized).toBe("a_b_c.txt");
			});

			it("preserves leading replacement characters", () => {
				const result = sanitizeFilename("_file.txt");
				expect(result.sanitized).toBe("_file.txt");
			});

			it("preserves trailing replacement characters", () => {
				const result = sanitizeFilename("file_");
				expect(result.sanitized).toBe("file_");
			});

			it("handles empty replacement character", () => {
				const result = sanitizeFilename("file/name.txt", {
					replacementChar: "",
				});
				expect(result.sanitized).toBe("filename.txt");
			});

			it("falls back to underscore for slash replacement character", () => {
				const result = sanitizeFilename("path/to/file.txt", {
					replacementChar: "/",
				});
				expect(result.sanitized).toBe("path_to_file.txt");
			});

			it("falls back to underscore for backslash replacement character", () => {
				const result = sanitizeFilename("path\\to\\file.txt", {
					replacementChar: "\\",
				});
				expect(result.sanitized).toBe("path_to_file.txt");
			});

			it("falls back to underscore for control replacement character", () => {
				const result = sanitizeFilename("file\nname.txt", {
					replacementChar: "\n",
				});
				expect(result.sanitized).toBe("file_name.txt");
			});

			it("falls back to underscore for multi-character replacement", () => {
				const result = sanitizeFilename("file/name.txt", {
					replacementChar: "--",
				});
				expect(result.sanitized).toBe("file_name.txt");
			});
		});

		describe("complex scenarios", () => {
			it("handles multiple issues in single filename", () => {
				const result = sanitizeFilename("../path/to\x00/file\nname.txt");
				expect(result.sanitized).toBe("path_to_file_name.txt");
				expect(result.wasModified).toBe(true);
				expect(result.appliedOperations).toContain("removed_null_bytes");
				expect(result.appliedOperations).toContain("removed_control_characters");
				expect(result.appliedOperations).toContain("removed_path_separators");
			});

			it("handles unicode filenames", () => {
				const result = sanitizeFilename("文件.txt");
				expect(result.sanitized).toBe("文件.txt");
				expect(result.wasModified).toBe(false);
			});

			it("handles emoji in filenames", () => {
				const result = sanitizeFilename("photo📷.png");
				expect(result.sanitized).toBe("photo📷.png");
				expect(result.wasModified).toBe(false);
			});

			it("handles filenames with multiple extensions", () => {
				const result = sanitizeFilename("archive.tar.gz");
				expect(result.sanitized).toBe("archive.tar.gz");
				expect(result.wasModified).toBe(false);
			});

			it("handles filename with only extension", () => {
				const result = sanitizeFilename(".txt");
				expect(result.sanitized).toBe(".txt");
				expect(result.wasModified).toBe(false);
			});

			it("handles filename without extension", () => {
				const result = sanitizeFilename("README");
				expect(result.sanitized).toBe("README");
				expect(result.wasModified).toBe(false);
			});
		});

		describe("security edge cases", () => {
			it("prevents null byte injection attack", () => {
				const result = sanitizeFilename("file.txt\x00.exe");
				expect(result.sanitized).toBe("file.txt.exe");
				expect(result.sanitized).not.toContain("\x00");
			});

			it("sanitizes double dots even in URL-encoded strings", () => {
				// Percent-encoded path separators are normalized before sanitization.
				// This prevents traversal if the string is decoded later.
				const result = sanitizeFilename("..%2f..%2fetc%2fpasswd");
				expect(result.sanitized).not.toContain("..");
				expect(result.sanitized).not.toContain("%2f");
				expect(result.sanitized).not.toContain("/");
				expect(result.sanitized).not.toContain("\\");
			});

			it("handles very long path traversal attempts", () => {
				const malicious = `${"../".repeat(100)}etc/passwd`;
				const result = sanitizeFilename(malicious);
				expect(result.sanitized).not.toContain("..");
				expect(result.sanitized).not.toContain("/");
			});

			it("handles backslash-based traversal", () => {
				const result = sanitizeFilename("..\\..\\Windows\\System32\\config");
				expect(result.sanitized).not.toContain("\\");
				expect(result.sanitized).not.toContain("..");
			});

			it("handles mixed traversal attempts", () => {
				const result = sanitizeFilename(".../....//...\\file.txt");
				expect(result.sanitized).not.toContain("..");
				expect(result.sanitized).not.toContain("/");
				expect(result.sanitized).not.toContain("\\");
			});
		});
	});

	describe("sanitize", () => {
		it("returns sanitized string directly", () => {
			const result = sanitize("file/name.txt");
			expect(result).toBe("file_name.txt");
		});

		it("accepts options", () => {
			const result = sanitize("file/name.txt", { replacementChar: "-" });
			expect(result).toBe("file-name.txt");
		});

		it("returns fallback for empty input", () => {
			expect(sanitize("")).toBe(DEFAULT_FALLBACK_FILENAME);
		});
	});

	describe("constants", () => {
		it("exports DEFAULT_MAX_FILENAME_LENGTH as 255", () => {
			expect(DEFAULT_MAX_FILENAME_LENGTH).toBe(255);
		});

		it("exports DEFAULT_FALLBACK_FILENAME as 'file'", () => {
			expect(DEFAULT_FALLBACK_FILENAME).toBe("file");
		});
	});
});
