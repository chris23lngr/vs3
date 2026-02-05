"use client";

import { createStorageClient } from "../../../../../packages/vs3/dist/client/react";
import type { MetadataSchema } from "./server";

export const storageClient = createStorageClient<typeof MetadataSchema>({
	apiPath: "/api/storage",
});
