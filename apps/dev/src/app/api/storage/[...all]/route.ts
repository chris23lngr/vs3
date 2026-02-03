import { toNextJsRouteHandler } from "vs3";
import { storage } from "@/server/storage";

const basePath = "/api/storage";

const handler = async (req: Request) => {
	const url = new URL(req.url);
	if (url.pathname.startsWith(basePath)) {
		url.pathname = url.pathname.slice(basePath.length) || "/";
	}
	return storage.handler(new Request(url, req));
};

export const { GET, POST, PUT, DELETE, HEAD } = toNextJsRouteHandler({
	handler,
});
