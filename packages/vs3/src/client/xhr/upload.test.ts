import { beforeEach, describe, expect, it, vi } from "vitest";
import * as retryModule from "../../core/resilience/retry";
import type { RetryConfig } from "../../core/resilience/retry";

describe("xhrUpload retry logic", () => {
	it("should apply exponential backoff on retries", async () => {
		let attemptCount = 0;

		vi.resetModules();

		vi.doMock("../../core/resilience/retry", async () => {
			const actual =
				await vi.importActual<typeof import("../../core/resilience/retry")>(
					"../../core/resilience/retry",
				);

			return {
				...actual,
				sleep: vi.fn().mockResolvedValue(undefined),
			};
		});

		// Mock XhrFactory to fail first 2 attempts, succeed on 3rd
		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private errorHandler:
					| ((status: number, statusText: string, cleanup: () => void) => void)
					| undefined;
				private loadHandler:
					| ((success: boolean, status: number, statusText: string, cleanup: () => void) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendProgressHandler() {}
				appendErrorHandler(
					handler: (status: number, statusText: string, cleanup: () => void) => void,
				) {
					this.errorHandler = handler;
				}
				appendAbortHandler() {}
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
					if (!this.errorHandler || !this.loadHandler) {
						throw new Error("Handlers not initialized");
					}
					if (attemptCount < 3) {
						this.errorHandler(500, "Internal Server Error", () => {});
					} else {
						this.loadHandler(true, 200, "OK", () => {});
					}
				}
			},
		}));

		const { sleep } = await import("../../core/resilience/retry");
		const { xhrUpload } = await import("./upload");

		const mockFile = new File(["test"], "test.txt", { type: "text/plain" });

		const retryConfig: RetryConfig = {
			baseDelayMs: 100,
			backoffMultiplier: 2,
			maxDelayMs: 1000,
			maxJitterMs: 0,
		};

		await xhrUpload("https://example.com/upload", mockFile, {
			retry: 3,
			retryConfig,
		});

		const sleepMock = vi.mocked(sleep);
		expect(sleepMock).toHaveBeenCalledTimes(2);
		expect(sleepMock).toHaveBeenNthCalledWith(1, 100);
		expect(sleepMock).toHaveBeenNthCalledWith(2, 200);

		vi.doUnmock("../../core/resilience/retry");
		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});

	it("should use calculateRetryDelay function for delays", () => {
		const { calculateRetryDelay } = retryModule;

		const config: RetryConfig = {
			baseDelayMs: 100,
			backoffMultiplier: 2,
			maxDelayMs: 1000,
			maxJitterMs: 0,
		};

		const delay1 = calculateRetryDelay(1, config);
		const delay2 = calculateRetryDelay(2, config);
		const delay3 = calculateRetryDelay(3, config);

		expect(delay1).toBe(100); // 100 * 2^0
		expect(delay2).toBe(200); // 100 * 2^1
		expect(delay3).toBe(400); // 100 * 2^2
	});

	it("should add jitter to retry delays when configured", () => {
		const { calculateRetryDelay } = retryModule;

		const config: RetryConfig = {
			baseDelayMs: 1000,
			backoffMultiplier: 2,
			maxDelayMs: 30000,
			maxJitterMs: 500,
		};

		// Run multiple times to verify jitter is random
		const delays = [];
		for (let i = 0; i < 10; i++) {
			const delay = calculateRetryDelay(1, config);
			delays.push(delay);
		}

		// All delays should be in range [1000, 1500]
		for (const delay of delays) {
			expect(delay).toBeGreaterThanOrEqual(1000);
			expect(delay).toBeLessThanOrEqual(1500);
		}

		// Should have some variation (not all identical)
		const uniqueDelays = new Set(delays.map(d => Math.floor(d / 10)));
		expect(uniqueDelays.size).toBeGreaterThan(1);
	});

	it("should respect maxDelayMs cap", () => {
		const { calculateRetryDelay } = retryModule;

		const config: RetryConfig = {
			baseDelayMs: 1000,
			backoffMultiplier: 2,
			maxDelayMs: 5000,
			maxJitterMs: 0,
		};

		// High attempt numbers should be capped
		const delay10 = calculateRetryDelay(10, config);
		const delay20 = calculateRetryDelay(20, config);

		expect(delay10).toBe(5000);
		expect(delay20).toBe(5000);
	});
});

describe("xhrUpload options", () => {
	it("should accept retryConfig option in XhrUploadOptions", async () => {
		vi.resetModules();

		vi.doMock("./xhr-factory", () => ({
			XhrFactory: class MockXhrFactory {
				private loadHandler:
					| ((success: boolean, status: number, statusText: string, cleanup: () => void) => void)
					| undefined;

				open() {}
				appendHeaders() {}
				appendProgressHandler() {}
				appendErrorHandler() {}
				appendAbortHandler() {}
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
					if (!this.loadHandler) {
						throw new Error("Load handler not initialized");
					}
					this.loadHandler(true, 200, "OK", () => {});
				}
			},
		}));

		const { xhrUpload } = await import("./upload");

		const customRetryConfig: RetryConfig = {
			baseDelayMs: 500,
			backoffMultiplier: 3,
			maxDelayMs: 10000,
			maxJitterMs: 200,
		};

		// This test verifies the type signature is correct
		// and retryConfig is accepted as a parameter
		const mockFile = new File(["test"], "test.txt", { type: "text/plain" });

		await expect(
			xhrUpload("https://example.com/upload", mockFile, {
				retry: 2,
				retryConfig: customRetryConfig,
			}),
		).resolves.toMatchObject({
			uploadUrl: "https://example.com/upload",
		});

		vi.doUnmock("./xhr-factory");
		vi.resetModules();
	});
});
