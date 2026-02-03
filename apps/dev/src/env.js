import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		NODE_ENV: z.enum(["development", "test", "production"]),

		// Storage
		STORAGE_HOST: z.string(),
		STORAGE_REGION: z.string(),
		STORAGE_SECURE: z.boolean().default(true),
		STORAGE_FORCE_PATH_STYLE: z.boolean().default(false),
		STORAGE_ACCESS_KEY_ID: z.string(),
		STORAGE_ACCESS_KEY: z.string(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		// NEXT_PUBLIC_CLIENTVAR: process.env.NEXT_PUBLIC_CLIENTVAR,

		STORAGE_HOST: process.env.STORAGE_HOST,
		STORAGE_REGION: process.env.STORAGE_REGION,
		STORAGE_SECURE: process.env.STORAGE_SECURE,
		STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE,
		STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
		STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
