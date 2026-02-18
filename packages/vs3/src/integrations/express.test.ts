import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { toExpressHandler } from "./express";

type StartedServer = {
	baseUrl: string;
	close: () => Promise<void>;
};

async function startExpressServer(
	handler: (request: Request) => Promise<Response>,
): Promise<StartedServer> {
	const app = express();
	app.use("/api/storage", toExpressHandler(handler));
	const server = app.listen(0);
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		close: async () => {
			server.close();
			await once(server, "close");
		},
	};
}

describe("toExpressHandler", () => {
	const cleanup: Array<() => Promise<void>> = [];

	afterEach(async () => {
		while (cleanup.length > 0) {
			const dispose = cleanup.pop();
			if (dispose) await dispose();
		}
	});

	it("handles POST bodies without Request duplex errors", async () => {
		let captured: Request | null = null;
		const server = await startExpressServer(async (request) => {
			captured = request;
			const body = await request.text();
			return new Response(body, { status: 200 });
		});
		cleanup.push(server.close);

		const headers = new Headers({ "content-type": "application/json" });
		headers.append("x-array", "a");
		headers.append("x-array", "b");

		const response = await fetch(`${server.baseUrl}/api/storage/upload-url`, {
			method: "POST",
			headers,
			body: JSON.stringify({ ok: true }),
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe(JSON.stringify({ ok: true }));
		expect(captured).not.toBeNull();
		expect(captured?.headers.get("x-array")).toBe("a, b");
		expect(captured?.headers.get("x-missing")).toBeNull();
	});
});
