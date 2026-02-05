import { describe, expect, it } from "vitest";
import { StorageErrorCode } from "../error/codes";
import { validateStorageOptions } from "./validate-options";

describe("validateStorageOptions", () => {
	describe("maxFileSize validation", () => {
		it("accepts valid positive maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: 1000000,
				}),
			).not.toThrow();
		});

		it("accepts undefined maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: undefined,
				}),
			).not.toThrow();
		});

		it("accepts maxFileSize when not provided", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
				}),
			).not.toThrow();
		});

		it("rejects zero maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: 0,
				}),
			).toThrow(
				expect.objectContaining({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "Invalid maxFileSize configuration.",
					details: "maxFileSize must be greater than 0.",
				}),
			);
		});

		it("rejects negative maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: -100,
				}),
			).toThrow(
				expect.objectContaining({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "Invalid maxFileSize configuration.",
					details: "maxFileSize must be greater than 0.",
				}),
			);
		});

		it("rejects NaN maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: Number.NaN,
				}),
			).toThrow(
				expect.objectContaining({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "Invalid maxFileSize configuration.",
					details: "maxFileSize must be a finite number.",
				}),
			);
		});

		it("rejects Infinity maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: Number.POSITIVE_INFINITY,
				}),
			).toThrow(
				expect.objectContaining({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "Invalid maxFileSize configuration.",
					details: "maxFileSize must be a finite number.",
				}),
			);
		});

		it("rejects negative Infinity maxFileSize", () => {
			expect(() =>
				validateStorageOptions({
					bucket: "test",
					adapter: {} as any,
					maxFileSize: Number.NEGATIVE_INFINITY,
				}),
			).toThrow(
				expect.objectContaining({
					code: StorageErrorCode.INVALID_FILE_INFO,
					message: "Invalid maxFileSize configuration.",
					details: "maxFileSize must be a finite number.",
				}),
			);
		});
	});
});
