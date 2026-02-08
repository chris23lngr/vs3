import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const external = [
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
	entry: {
		index: "src/index.ts",
		react: "src/client/react/index.ts",
		"next-js": "src/integrations/next-js.ts",
		adapters: "src/adapters/index.ts",
		"middleware-auth": "src/middleware/auth/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	external,
});
