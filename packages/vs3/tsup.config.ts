import { defineConfig } from "tsup";

export default defineConfig({
	entry: {
		index: "src/index.ts",
		react: "src/client/react/index.ts",
		"next-js": "src/integrations/next-js.ts",
		adapters: "src/adapters/index.ts",
	},
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	external: [
		"@aws-sdk/client-s3",
		"@aws-sdk/s3-request-presigner",
		"react",
		"@nanostores/react",
		"nanostores",
		"better-call",
		"better-fetch",
		"zod",
	],
});
