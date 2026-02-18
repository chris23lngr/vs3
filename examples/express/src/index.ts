import express from "express";
import { toExpressHandler } from "vs3/integrations/express";
import { storage } from "./storage.js";

const app = express();
app.use("/api/storage", toExpressHandler(storage.handler));

const port = Number(process.env.PORT) || 3011;
app.listen(port, () => {
	console.log(`vs3 Express example at http://localhost:${port}/api/storage`);
});
