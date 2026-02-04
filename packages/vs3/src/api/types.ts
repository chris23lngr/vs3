import type { StandardSchemaV1 } from "../types/standard-schema";

export type RouteConfig = {
	readonly path: `/${string}`;

	readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

	body?: StandardSchemaV1;

	query?: StandardSchemaV1;

	output: StandardSchemaV1;
};

