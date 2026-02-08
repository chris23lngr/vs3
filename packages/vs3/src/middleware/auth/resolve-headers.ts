/**
 * Converts a `Headers` object into a plain key-value record.
 */
export function resolveHeaders(request: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return headers;
}
