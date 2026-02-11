import {
	calculateRetryDelay,
	type RetryConfig,
	sleep,
} from "../../core/resilience/retry";

const DEFAULT_RETRY_ATTEMPTS = 3;

type RetryableError = Error | DOMException;

type ExecuteWithRetriesParams<T> = {
	maxAttempts: number;
	retryConfig: RetryConfig;
	execute: () => Promise<T>;
	unknownErrorMessage: string;
	noAttemptsMessage: string;
	signal?: AbortSignal;
	abortMessage?: string;
};

export function resolveMaxAttempts(retry?: undefined | true | number): number {
	if (typeof retry === "number") {
		return Math.max(1, retry);
	}

	if (retry === true) {
		return DEFAULT_RETRY_ATTEMPTS;
	}

	return 1;
}

function normalizeError(
	error: unknown,
	unknownErrorMessage: string,
): RetryableError {
	if (error instanceof DOMException || error instanceof Error) {
		return error;
	}

	return new Error(unknownErrorMessage);
}

function createAbortError(message: string): DOMException {
	return new DOMException(message, "AbortError");
}

async function waitForRetryDelay(
	delayMs: number,
	signal: AbortSignal | undefined,
	abortMessage: string,
): Promise<void> {
	if (!signal) {
		await sleep(delayMs);
		return;
	}

	if (signal.aborted) {
		throw createAbortError(abortMessage);
	}

	let abortHandler: (() => void) | undefined;
	const abortPromise = new Promise<never>((_resolve, reject) => {
		abortHandler = () => {
			reject(createAbortError(abortMessage));
		};
		signal.addEventListener("abort", abortHandler, { once: true });
	});

	try {
		await Promise.race([sleep(delayMs), abortPromise]);
	} finally {
		if (abortHandler) {
			signal.removeEventListener("abort", abortHandler);
		}
	}
}

export async function executeWithRetries<T>({
	maxAttempts,
	retryConfig,
	execute,
	unknownErrorMessage,
	noAttemptsMessage,
	signal,
	abortMessage = "Operation aborted",
}: ExecuteWithRetriesParams<T>): Promise<T> {
	let attempt = 0;
	let lastError: RetryableError | undefined;

	while (attempt < maxAttempts) {
		try {
			return await execute();
		} catch (error) {
			const normalizedError = normalizeError(error, unknownErrorMessage);
			lastError = normalizedError;
			attempt++;

			if (
				normalizedError instanceof DOMException &&
				normalizedError.name === "AbortError"
			) {
				throw normalizedError;
			}

			if (attempt >= maxAttempts) {
				throw normalizedError;
			}

			const delayMs = calculateRetryDelay(attempt, retryConfig);
			await waitForRetryDelay(delayMs, signal, abortMessage);
		}
	}

	throw lastError ?? new Error(noAttemptsMessage);
}
