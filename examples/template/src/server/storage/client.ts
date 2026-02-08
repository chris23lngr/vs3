"use client";

import { createStorageClient } from "vs3/react";
import type { MetadataSchema } from "./server";

export const storageClient = createStorageClient<typeof MetadataSchema>({
	apiPath: "/api/storage",
});
