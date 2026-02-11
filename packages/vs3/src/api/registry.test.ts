import { describe, expect, it } from "vitest";
import { routeRegistry } from "./registry";

describe("routeRegistry", () => {
	it("enforces positive integer part numbers in multipart presign output", () => {
		const schema = routeRegistry["/multipart/presign-parts"].output;

		expect(
			schema.safeParse({
				parts: [{ partNumber: 1, presignedUrl: "https://example.com/part-1" }],
			}).success,
		).toBe(true);

		expect(
			schema.safeParse({
				parts: [{ partNumber: 0, presignedUrl: "https://example.com/part-0" }],
			}).success,
		).toBe(false);

		expect(
			schema.safeParse({
				parts: [{ partNumber: 1.5, presignedUrl: "https://example.com/part-2" }],
			}).success,
		).toBe(false);
	});
});
