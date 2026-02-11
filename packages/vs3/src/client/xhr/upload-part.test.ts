import { describe, expect, it, vi } from "vitest";
import type { RetryConfig } from "../../core/resilience/retry";

describe("xhrUploadPart", () => {
	it("resolves with partNumber and eTag on success", async () => {
		vi.resetModules();

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private loadHandler:
					| ((
							success: boolean,
							status: number,
							statusText: string,
							cleanup: () => void,
					  ) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler() {}
				getResponseHeader(name: string) {
					if (name === "etag") return '"abc-123"';
					return null;
				}
				appendLoadHandler(
					handler: (
						success: boolean,
						status: number,
						statusText: string,
						cleanup: () => void,
					) => void,
				) {
					this.loadHandler = handler;
				}
				send() {
					this.loadHandler?.(true, 200, "OK", () => {});
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		const result = await xhrUploadPart({
			presignedUrl: "https://s3.example.com/part-1",
			partNumber: 1,
			body: new Blob(["test"]),
		});

		expect(result).toEqual({ partNumber: 1, eTag: '"abc-123"' });

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("applies upload headers to XHR request", async () => {
		vi.resetModules();
		let capturedHeaders: Record<string, string> | undefined;

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private loadHandler:
					| ((
							success: boolean,
							status: number,
							statusText: string,
							cleanup: () => void,
					  ) => void)
					| undefined;

				open() {}
				appendHeaders(headers?: Record<string, string>) {
					capturedHeaders = headers;
				}
				appendRawProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler() {}
				getResponseHeader(name: string) {
					if (name === "etag") return '"abc-123"';
					return null;
				}
				appendLoadHandler(
					handler: (
						success: boolean,
						status: number,
						statusText: string,
						cleanup: () => void,
					) => void,
				) {
					this.loadHandler = handler;
				}
				send() {
					this.loadHandler?.(true, 200, "OK", () => {});
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");
		const headers = {
			"x-amz-server-side-encryption-customer-algorithm": "AES256",
		};

		await xhrUploadPart({
			presignedUrl: "https://s3.example.com/part-1",
			partNumber: 1,
			body: new Blob(["test"]),
			headers,
		});

		expect(capturedHeaders).toEqual(headers);

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("rejects when ETag header is missing", async () => {
		vi.resetModules();

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private loadHandler:
					| ((
							success: boolean,
							status: number,
							statusText: string,
							cleanup: () => void,
					  ) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler() {}
				getResponseHeader() {
					return null;
				}
				appendLoadHandler(
					handler: (
						success: boolean,
						status: number,
						statusText: string,
						cleanup: () => void,
					) => void,
				) {
					this.loadHandler = handler;
				}
				send() {
					this.loadHandler?.(true, 200, "OK", () => {});
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		await expect(
			xhrUploadPart({
				presignedUrl: "https://s3.example.com/part-1",
				partNumber: 1,
				body: new Blob(["test"]),
			}),
		).rejects.toThrow("S3 did not return an ETag header");

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("rejects on XHR error", async () => {
		vi.resetModules();

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private errorHandler:
					| ((status: number, statusText: string, cleanup: () => void) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler(
					handler: (status: number, statusText: string, cleanup: () => void) => void,
				) {
					this.errorHandler = handler;
				}
				appendAbortHandler() {}
				getResponseHeader() {
					return null;
				}
				appendLoadHandler() {}
				send() {
					this.errorHandler?.(500, "Internal Server Error", () => {});
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		await expect(
			xhrUploadPart({
				presignedUrl: "https://s3.example.com/part-1",
				partNumber: 1,
				body: new Blob(["test"]),
			}),
		).rejects.toThrow("Part upload error: Internal Server Error");

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("rejects on abort", async () => {
		vi.resetModules();

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private abortHandler: (() => void) | undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler(handler: () => void) {
					this.abortHandler = handler;
				}
				getResponseHeader() {
					return null;
				}
				appendLoadHandler() {}
				send() {
					this.abortHandler?.();
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		await expect(
			xhrUploadPart({
				presignedUrl: "https://s3.example.com/part-1",
				partNumber: 1,
				body: new Blob(["test"]),
			}),
		).rejects.toThrow("Part upload aborted");

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("rejects on non-success load status", async () => {
		vi.resetModules();

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private loadHandler:
					| ((
							success: boolean,
							status: number,
							statusText: string,
							cleanup: () => void,
					  ) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler() {}
				getResponseHeader() {
					return null;
				}
				appendLoadHandler(
					handler: (
						success: boolean,
						status: number,
						statusText: string,
						cleanup: () => void,
					) => void,
				) {
					this.loadHandler = handler;
				}
				send() {
					this.loadHandler?.(false, 403, "Forbidden", () => {});
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		await expect(
			xhrUploadPart({
				presignedUrl: "https://s3.example.com/part-1",
				partNumber: 1,
				body: new Blob(["test"]),
			}),
		).rejects.toThrow("Part upload failed: Forbidden");

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("retries on failure and succeeds", async () => {
		let attemptCount = 0;
		vi.resetModules();

		vi.doMock("../../core/resilience/retry", async () => {
			const actual = await vi.importActual<
				typeof import("../../core/resilience/retry")
			>("../../core/resilience/retry");
			return {
				...actual,
				sleep: vi.fn().mockResolvedValue(undefined),
			};
		});

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private errorHandler:
					| ((status: number, statusText: string, cleanup: () => void) => void)
					| undefined;
				private loadHandler:
					| ((
							success: boolean,
							status: number,
							statusText: string,
							cleanup: () => void,
					  ) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler(
					handler: (status: number, statusText: string, cleanup: () => void) => void,
				) {
					this.errorHandler = handler;
				}
				appendAbortHandler() {}
				getResponseHeader(name: string) {
					if (name === "etag") return '"retry-etag"';
					return null;
				}
				appendLoadHandler(
					handler: (
						success: boolean,
						status: number,
						statusText: string,
						cleanup: () => void,
					) => void,
				) {
					this.loadHandler = handler;
				}
				send() {
					attemptCount++;
					if (attemptCount < 3) {
						this.errorHandler?.(500, "Internal Server Error", () => {});
					} else {
						this.loadHandler?.(true, 200, "OK", () => {});
					}
				}
			},
		}));

		const { sleep } = await import("../../core/resilience/retry");
		const { xhrUploadPart } = await import("./upload-part");

		const retryConfig: RetryConfig = {
			baseDelayMs: 100,
			backoffMultiplier: 2,
			maxDelayMs: 1000,
			maxJitterMs: 0,
		};

		const result = await xhrUploadPart(
			{
				presignedUrl: "https://s3.example.com/part-1",
				partNumber: 1,
				body: new Blob(["test"]),
			},
			{ retry: 3, retryConfig },
		);

		expect(result).toEqual({ partNumber: 1, eTag: '"retry-etag"' });
		expect(attemptCount).toBe(3);

		const sleepMock = vi.mocked(sleep);
		expect(sleepMock).toHaveBeenCalledTimes(2);
		expect(sleepMock).toHaveBeenNthCalledWith(1, 100);
		expect(sleepMock).toHaveBeenNthCalledWith(2, 200);

		vi.doUnmock("../../core/resilience/retry");
		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("does not retry on abort error", async () => {
		let attemptCount = 0;
		vi.resetModules();

		vi.doMock("../../core/resilience/retry", async () => {
			const actual = await vi.importActual<
				typeof import("../../core/resilience/retry")
			>("../../core/resilience/retry");
			return {
				...actual,
				sleep: vi.fn().mockResolvedValue(undefined),
			};
		});

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private abortHandler: (() => void) | undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler(handler: () => void) {
					this.abortHandler = handler;
				}
				getResponseHeader() {
					return null;
				}
				appendLoadHandler() {}
				send() {
					attemptCount++;
					this.abortHandler?.();
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		await expect(
			xhrUploadPart(
				{
					presignedUrl: "https://s3.example.com/part-1",
					partNumber: 1,
					body: new Blob(["test"]),
				},
				{ retry: 3 },
			),
		).rejects.toThrow("Part upload aborted");

		// Should only attempt once — abort is not retryable
		expect(attemptCount).toBe(1);

		vi.doUnmock("../../core/resilience/retry");
		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("aborts during retry backoff without waiting for next attempt", async () => {
		let attemptCount = 0;
		vi.resetModules();

		vi.doMock("../../core/resilience/retry", async () => {
			const actual = await vi.importActual<
				typeof import("../../core/resilience/retry")
			>("../../core/resilience/retry");
			return {
				...actual,
				sleep: vi.fn(() => new Promise<void>(() => {})),
			};
		});

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private errorHandler:
					| ((status: number, statusText: string, cleanup: () => void) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendRawProgressHandler() {}
				appendErrorHandler(
					handler: (status: number, statusText: string, cleanup: () => void) => void,
				) {
					this.errorHandler = handler;
				}
				appendAbortHandler() {}
				getResponseHeader() {
					return null;
				}
				appendLoadHandler() {}
				send() {
					attemptCount++;
					this.errorHandler?.(500, "Internal Server Error", () => {});
				}
			},
		}));

		const { xhrUploadPart } = await import("./upload-part");

		const controller = new AbortController();
		const request = xhrUploadPart(
			{
				presignedUrl: "https://s3.example.com/part-1",
				partNumber: 1,
				body: new Blob(["test"]),
				signal: controller.signal,
			},
			{ retry: 3 },
		);

		expect(attemptCount).toBe(1);

		controller.abort();

		await expect(request).rejects.toThrow("Part upload aborted");
		expect(attemptCount).toBe(1);

		vi.doUnmock("../../core/resilience/retry");
		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});
});
