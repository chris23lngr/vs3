"use client";

import { createStorageClient } from "vs3";

export const storageClient = createStorageClient({
	apiPath: "/api/storage",
});
