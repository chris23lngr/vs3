import { createRequestSigner } from "../../core/security/request-signer";
import type {
	RequestSigningConfig,
	SignatureHeaders,
} from "../../types/security";

function headersToRecord(headers: SignatureHeaders): Record<string, string> {
	const record: Record<string, string> = {
		"x-signature": headers["x-signature"],
		"x-timestamp": headers["x-timestamp"],
	};
	if (headers["x-nonce"]) {
		record["x-nonce"] = headers["x-nonce"];
	}
	return record;
}

/**
 * Creates a client-side request signer that can be used to sign outgoing requests.
 */
export function createClientRequestSigner(config: RequestSigningConfig): {
	sign: (input: {
		method: string;
		path: string;
		body?: string;
		nonce?: string;
	}) => Promise<{
		headers: Record<string, string>;
		timestamp: number;
		signature: string;
	}>;
} {
	const signer = createRequestSigner(config);

	return {
		sign: async (input) => {
			const result = await signer.sign({
				method: input.method,
				path: input.path,
				body: input.body,
				nonce: input.nonce,
			});

			return {
				headers: headersToRecord(result.headers),
				timestamp: result.timestamp,
				signature: result.signature,
			};
		},
	};
}
