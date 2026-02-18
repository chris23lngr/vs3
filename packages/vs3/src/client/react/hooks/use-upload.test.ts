/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBaseClient } from "../../create-client";
import { createUseUpload } from "./use-upload";

const file = new File(["hello"], "file.txt", { type: "text/plain" });

describe("createUseUpload (React)", () => {
	it("sets isLoading to true when transitioning to loading status", async () => {
		const client = createBaseClient({});
		const result = {
			key: "uploads/file.txt",
			presignedUrl: "https://example.com/presigned",
			uploadUrl: "https://example.com/upload",
			status: 200,
			statusText: "OK",
		};
		client.uploadFile = vi.fn(async (_file, _metadata, options) => {
			options?.onProgress?.(25);
			return result;
		});

		const useUpload = createUseUpload(client);
		const { result: hookResult } = renderHook(() => useUpload());

		await act(async () => {
			hookResult.current.upload(file, {});
		});

		expect(hookResult.current.state.status).toBe("success");
		expect(hookResult.current.state.isLoading).toBe(false);
		expect(hookResult.current.state.progress).toBe(25);
		expect(hookResult.current.state.data).toEqual(result);
	});

	it("transitions to loading with isLoading true (regression)", async () => {
		const client = createBaseClient({});
		const result = {
			key: "uploads/file.txt",
			presignedUrl: "https://example.com/presigned",
			uploadUrl: "https://example.com/upload",
			status: 200,
			statusText: "OK",
		};
		client.uploadFile = vi.fn(async (_file, _metadata, options) => {
			options?.onProgress?.(50);
			return result;
		});

		const useUpload = createUseUpload(client);
		const { result: hookResult } = renderHook(() => useUpload());

		await act(async () => {
			hookResult.current.upload(file, {});
		});

		expect(hookResult.current.state.status).toBe("success");
		expect(hookResult.current.state.isLoading).toBe(false);
	});

	it("sets isLoading false on error", async () => {
		const client = createBaseClient({});
		client.uploadFile = vi.fn(async () => {
			throw new Error("boom");
		});

		const useUpload = createUseUpload(client);
		const uploadRef = {
			current: null as ((f: File, m: object) => Promise<void>) | null,
		};
		const { result: hookResult } = renderHook(() => {
			const hookResult = useUpload();
			uploadRef.current = hookResult.upload;
			return hookResult;
		});

		await act(async () => {
			await uploadRef.current?.(file, {});
		});

		expect(hookResult.current.state.status).toBe("error");
		expect(hookResult.current.state.isLoading).toBe(false);
	});
});
