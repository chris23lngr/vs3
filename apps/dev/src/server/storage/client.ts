"use client";

import { createStorageClient, createStorageClientFromServer } from "vs3";
import { storage } from "./server";

export const storageClient = createStorageClient({
	apiPath: "/api/storage",
});
