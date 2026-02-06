import { StorageErrorCode } from "../../core/error/codes";
import type { AuthHook, AuthHookResult } from "../../types/security";
import { throwVerificationFailure } from "./errors";

function buildAuthHeaders(request: Request): Record<string, string> {
	const headers: Record<string, string> = {};
	request.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return headers;
}

export async function runAuthHook(
	request: Request,
	authHook?: AuthHook,
	onVerificationFailure?: (reason: string, request: Request) => Response | never,
): Promise<AuthHookResult | undefined> {
	if (!authHook) {
		return undefined;
	}

	const headers = buildAuthHeaders(request);
	const authResult = await authHook({ request, headers });
	if (authResult.authenticated) {
		return authResult;
	}

	throwVerificationFailure({
		reason: "auth_failed",
		code: StorageErrorCode.UNAUTHORIZED,
		message: authResult.reason ?? "Authentication failed.",
		details: { authHookFailed: true },
		request,
		onVerificationFailure,
	});
}
