import { toCloudflareWorkerHandler } from "vs3/integrations/cloudflare-workers";
import { createStorageFromEnv, type Env } from "./storage.js";

export default {
	async fetch(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<Response> {
		const storage = createStorageFromEnv(env);
		const handler = toCloudflareWorkerHandler(storage.handler);

		const url = new URL(request.url);
		if (!url.pathname.startsWith("/api/storage")) {
			return new Response("Not Found", { status: 404 });
		}

		return handler(request);
	},
};
