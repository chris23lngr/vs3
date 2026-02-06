import type { Headers } from "./types";

export class XhrFactory {
	private xhr: XMLHttpRequest;
	private signal: AbortSignal | undefined;
	private abortHandler: (() => void) | undefined;

	constructor(signal?: AbortSignal) {
		this.xhr = new XMLHttpRequest();
		this.signal = signal;
	}

	open(method: "PUT" | "POST", url: string | URL, async: boolean = true) {
		this.xhr.open(method, url, async);

		if (this.signal !== undefined) {
			if (this.signal.aborted) {
				this.xhr.abort();
				return;
			}
			this.abortHandler = () => {
				this.xhr.abort();
			};
			this.signal.addEventListener("abort", this.abortHandler, { once: true });
		}
	}

	cleanup = (): void => {
		if (this.signal !== undefined && this.abortHandler !== undefined) {
			this.signal.removeEventListener("abort", this.abortHandler);
		}
	};

	/**
	 * Takes in a Headers object and appends all of the headers to the
	 * XMLHttpRequest instance.
	 *
	 * @param headers
	 */
	appendHeaders(headers?: Headers) {
		if (!headers) {
			return;
		}

		const requestHeaders = new Headers(headers);

		requestHeaders.forEach((value, key) => {
			this.xhr.setRequestHeader(key, value);
		});
	}

	appendProgressHandler(handler?: (progress: number) => void) {
		if (!handler) {
			return;
		}

		this.xhr.upload.onprogress = (event) => {
			const percentage = event.total ? event.loaded / event.total : undefined;

			if (!percentage) {
				// TODO: Throw error when progress is not calculable
				return;
			}

			handler(percentage);
		};
	}

	appendAbortHandler(handler: () => void) {
		this.xhr.onabort = () => {
			this.cleanup();
			handler();
		};
	}

	// TODO: Add improved error handling with unified error response
	appendErrorHandler(
		handler: (
			status: number,
			statusText: string,
			cleanup: typeof this.cleanup,
		) => void,
	) {
		this.xhr.onerror = () => {
			handler(this.xhr.status, this.xhr.statusText, this.cleanup);
		};
	}

	private isResponseSuccess(status: number) {
		return status >= 200 && status < 300;
	}

	appendLoadHandler(
		handler: (
			success: boolean,
			status: number,
			statusText: string,
			cleanup: typeof this.cleanup,
		) => void,
	) {
		this.xhr.onload = () => {
			if (this.isResponseSuccess(this.xhr.status)) {
				handler(true, this.xhr.status, this.xhr.statusText, this.cleanup);
				return;
			}

			// TODO: add error handling for non-success responses
			handler(false, this.xhr.status, this.xhr.statusText, this.cleanup);
		};
	}

	send(body: Document | XMLHttpRequestBodyInit) {
		this.xhr.send(body);
	}
}
