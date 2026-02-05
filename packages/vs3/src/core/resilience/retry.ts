/**
 * Configuration options for retry behavior with exponential backoff.
 */
export type RetryConfig = {
	/**
	 * The base delay in milliseconds for the first retry attempt.
	 *
	 * @default 1000 (1 second)
	 */
	baseDelayMs: number;

	/**
	 * The multiplier applied to the delay for each subsequent retry.
	 * For example, with baseDelayMs=1000 and backoffMultiplier=2:
	 * - Retry 1: 1000ms
	 * - Retry 2: 2000ms
	 * - Retry 3: 4000ms
	 *
	 * @default 2
	 */
	backoffMultiplier: number;

	/**
	 * The maximum delay in milliseconds between retries.
	 * This caps the exponential growth of the delay.
	 *
	 * @default 30000 (30 seconds)
	 */
	maxDelayMs: number;

	/**
	 * The maximum random jitter in milliseconds to add to the delay.
	 * Jitter helps prevent thundering herd by randomizing retry times.
	 * The actual jitter added will be a random value between 0 and this value.
	 *
	 * @default 1000 (1 second)
	 */
	maxJitterMs: number;
};

/**
 * Default retry configuration with exponential backoff.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
	baseDelayMs: 1000,
	backoffMultiplier: 2,
	maxDelayMs: 30000,
	maxJitterMs: 1000,
};

/**
 * Calculates the delay in milliseconds before the next retry attempt
 * using exponential backoff strategy.
 *
 * @param attemptNumber - The current attempt number (1-based, where 1 is the first retry)
 * @param config - The retry configuration
 * @returns The delay in milliseconds
 */
export function calculateBackoffDelay(
	attemptNumber: number,
	config: RetryConfig,
): number {
	const { baseDelayMs, backoffMultiplier, maxDelayMs } = config;

	const exponentialDelay =
		baseDelayMs * backoffMultiplier ** (attemptNumber - 1);

	return Math.min(exponentialDelay, maxDelayMs);
}

/**
 * Adds random jitter to a delay value to prevent thundering herd.
 *
 * @param delayMs - The base delay in milliseconds
 * @param config - The retry configuration
 * @returns The delay with jitter applied
 */
export function addJitter(delayMs: number, config: RetryConfig): number {
	const { maxJitterMs } = config;
	const jitter = Math.random() * maxJitterMs;
	return delayMs + jitter;
}

/**
 * Calculates the retry delay with exponential backoff and jitter.
 *
 * @param attemptNumber - The current attempt number (1-based)
 * @param config - The retry configuration
 * @returns The delay in milliseconds with jitter applied
 */
export function calculateRetryDelay(
	attemptNumber: number,
	config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
	const backoffDelay = calculateBackoffDelay(attemptNumber, config);
	return addJitter(backoffDelay, config);
}

/**
 * Sleeps for the specified duration.
 *
 * @param durationMs - The duration to sleep in milliseconds
 * @returns A promise that resolves after the duration
 */
export function sleep(durationMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, durationMs));
}
