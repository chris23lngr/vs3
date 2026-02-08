import { createRequestSigner } from "../../core/security/request-signer";
import type {
	RequestSigningConfig,
	SignatureHeaders,
} from "../../types/security";

type ServerSignInput = {
	method: string;
	path: string;
	body?: string;
	nonce?: string;
};

type ServerSignResult = {
	headers: Record<string, string>;
	timestamp: number;
	signature: string;
};

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
 * Creates a server-side request signer for trusted environments only.
 * Do not use this in browsers or untrusted clients.
 */
export function createServerRequestSigner(config: RequestSigningConfig): {
	sign: (input: ServerSignInput) => Promise<ServerSignResult>;
} {
	const signer = createRequestSigner(config);

	return {
		sign: async (input: ServerSignInput): Promise<ServerSignResult> => {
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
