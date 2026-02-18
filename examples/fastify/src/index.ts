import Fastify from "fastify";
import { toFastifyHandler } from "vs3/integrations/fastify";
import { storage } from "./storage.js";

const fastify = Fastify();

await fastify.register(
	async (instance) => {
		instance.all("/*", toFastifyHandler(storage.handler));
	},
	{ prefix: "/api/storage" },
);

const port = Number(process.env.PORT) || 3012;
fastify.listen({ port, host: "0.0.0.0" }, (err) => {
	if (err) throw err;
	console.log(`vs3 Fastify example at http://localhost:${port}/api/storage`);
});
