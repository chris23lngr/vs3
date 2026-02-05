import { describe, expect, it } from "vitest";
import {
	addJitter,
	calculateBackoffDelay,
	calculateRetryDelay,
	DEFAULT_RETRY_CONFIG,
	type RetryConfig,
} from "./retry";

describe("retry utility", () => {
	describe("calculateBackoffDelay", () => {
		it("should calculate exponential backoff correctly", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 0,
			};

			expect(calculateBackoffDelay(1, config)).toBe(1000); // 1000 * 2^0
			expect(calculateBackoffDelay(2, config)).toBe(2000); // 1000 * 2^1
			expect(calculateBackoffDelay(3, config)).toBe(4000); // 1000 * 2^2
			expect(calculateBackoffDelay(4, config)).toBe(8000); // 1000 * 2^3
			expect(calculateBackoffDelay(5, config)).toBe(16000); // 1000 * 2^4
		});

		it("should respect maxDelayMs cap", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 5000,
				maxJitterMs: 0,
			};

			expect(calculateBackoffDelay(1, config)).toBe(1000);
			expect(calculateBackoffDelay(2, config)).toBe(2000);
			expect(calculateBackoffDelay(3, config)).toBe(4000);
			expect(calculateBackoffDelay(4, config)).toBe(5000); // Capped at maxDelayMs
			expect(calculateBackoffDelay(5, config)).toBe(5000); // Capped at maxDelayMs
			expect(calculateBackoffDelay(10, config)).toBe(5000); // Capped at maxDelayMs
		});

		it("should work with different backoff multipliers", () => {
			const config: RetryConfig = {
				baseDelayMs: 100,
				backoffMultiplier: 3,
				maxDelayMs: 10000,
				maxJitterMs: 0,
			};

			expect(calculateBackoffDelay(1, config)).toBe(100); // 100 * 3^0
			expect(calculateBackoffDelay(2, config)).toBe(300); // 100 * 3^1
			expect(calculateBackoffDelay(3, config)).toBe(900); // 100 * 3^2
			expect(calculateBackoffDelay(4, config)).toBe(2700); // 100 * 3^3
		});

		it("should work with linear backoff (multiplier = 1)", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 1,
				maxDelayMs: 10000,
				maxJitterMs: 0,
			};

			expect(calculateBackoffDelay(1, config)).toBe(1000);
			expect(calculateBackoffDelay(2, config)).toBe(1000);
			expect(calculateBackoffDelay(3, config)).toBe(1000);
			expect(calculateBackoffDelay(10, config)).toBe(1000);
		});
	});

	describe("addJitter", () => {
		it("should add jitter within the specified range", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 500,
			};

			// Run multiple times to test randomness
			for (let i = 0; i < 100; i++) {
				const delayWithJitter = addJitter(1000, config);
				expect(delayWithJitter).toBeGreaterThanOrEqual(1000);
				expect(delayWithJitter).toBeLessThanOrEqual(1500);
			}
		});

		it("should work with zero jitter", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 0,
			};

			expect(addJitter(1000, config)).toBe(1000);
			expect(addJitter(2000, config)).toBe(2000);
		});

		it("should add different jitter amounts", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 1000,
			};

			const results = new Set<number>();

			// Collect multiple results to verify randomness
			for (let i = 0; i < 50; i++) {
				const delayWithJitter = addJitter(1000, config);
				results.add(Math.floor(delayWithJitter / 100));
			}

			// Should have multiple different values (not all the same)
			expect(results.size).toBeGreaterThan(5);
		});
	});

	describe("calculateRetryDelay", () => {
		it("should combine backoff and jitter", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 100,
			};

			const delay1 = calculateRetryDelay(1, config);
			expect(delay1).toBeGreaterThanOrEqual(1000);
			expect(delay1).toBeLessThanOrEqual(1100);

			const delay2 = calculateRetryDelay(2, config);
			expect(delay2).toBeGreaterThanOrEqual(2000);
			expect(delay2).toBeLessThanOrEqual(2100);

			const delay3 = calculateRetryDelay(3, config);
			expect(delay3).toBeGreaterThanOrEqual(4000);
			expect(delay3).toBeLessThanOrEqual(4100);
		});

		it("should use default config when not provided", () => {
			const delay = calculateRetryDelay(1);

			expect(delay).toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.baseDelayMs);
			expect(delay).toBeLessThanOrEqual(
				DEFAULT_RETRY_CONFIG.baseDelayMs +
					DEFAULT_RETRY_CONFIG.maxJitterMs,
			);
		});

		it("should respect maxDelayMs with jitter", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 5000,
				maxJitterMs: 500,
			};

			// Very high attempt number should still respect cap
			const delay = calculateRetryDelay(10, config);
			expect(delay).toBeGreaterThanOrEqual(5000);
			expect(delay).toBeLessThanOrEqual(5500); // maxDelayMs + maxJitterMs
		});
	});

	describe("DEFAULT_RETRY_CONFIG", () => {
		it("should have sensible defaults", () => {
			expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000);
			expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
			expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(30000);
			expect(DEFAULT_RETRY_CONFIG.maxJitterMs).toBe(1000);
		});

		it("should produce reasonable delays", () => {
			// Test first 5 retry attempts
			const delays = [
				calculateRetryDelay(1, { ...DEFAULT_RETRY_CONFIG, maxJitterMs: 0 }),
				calculateRetryDelay(2, { ...DEFAULT_RETRY_CONFIG, maxJitterMs: 0 }),
				calculateRetryDelay(3, { ...DEFAULT_RETRY_CONFIG, maxJitterMs: 0 }),
				calculateRetryDelay(4, { ...DEFAULT_RETRY_CONFIG, maxJitterMs: 0 }),
				calculateRetryDelay(5, { ...DEFAULT_RETRY_CONFIG, maxJitterMs: 0 }),
			];

			// Delays should be: 1s, 2s, 4s, 8s, 16s
			expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);

			// All should be under max
			for (const delay of delays) {
				expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
			}
		});
	});

	describe("edge cases", () => {
		it("should handle attempt number 0 gracefully", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 0,
			};

			// Attempt 0 means 2^-1 = 0.5
			expect(calculateBackoffDelay(0, config)).toBe(500);
		});

		it("should handle very large attempt numbers", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 2,
				maxDelayMs: 30000,
				maxJitterMs: 0,
			};

			// Should be capped at maxDelayMs
			expect(calculateBackoffDelay(100, config)).toBe(30000);
			expect(calculateBackoffDelay(1000, config)).toBe(30000);
		});

		it("should handle very small base delays", () => {
			const config: RetryConfig = {
				baseDelayMs: 1,
				backoffMultiplier: 2,
				maxDelayMs: 100,
				maxJitterMs: 10,
			};

			const delay = calculateRetryDelay(1, config);
			expect(delay).toBeGreaterThanOrEqual(1);
			expect(delay).toBeLessThanOrEqual(11);
		});

		it("should handle fractional multipliers", () => {
			const config: RetryConfig = {
				baseDelayMs: 1000,
				backoffMultiplier: 1.5,
				maxDelayMs: 10000,
				maxJitterMs: 0,
			};

			expect(calculateBackoffDelay(1, config)).toBe(1000); // 1000 * 1.5^0
			expect(calculateBackoffDelay(2, config)).toBe(1500); // 1000 * 1.5^1
			expect(calculateBackoffDelay(3, config)).toBe(2250); // 1000 * 1.5^2
		});
	});
});
