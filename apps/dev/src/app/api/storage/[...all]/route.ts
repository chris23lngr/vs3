import { toNextJsRouteHandler } from "vs3";
import { storage } from "@/server/storage";

export const { GET, POST, PUT, DELETE, HEAD } = toNextJsRouteHandler(storage);
