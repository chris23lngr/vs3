# VS3

Enterprise-grade S3 storage toolkit with first-class validation, middleware, and client helpers.

VS3 is a TypeScript-first library for building storage APIs that generate presigned upload URLs, enforce validation, and integrate cleanly with modern runtimes. The core package lives in `packages/vs3`.

## Quickstart

### Install

```bash
npm install vs3
```

### Server: create a storage API

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { aws, createStorage } from "vs3";
import z from "zod";

const storage = createStorage({
  bucket: process.env.AWS_BUCKET!,
  adapter: aws({
    client: new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    }),
  }),
  metadataSchema: z.object({
    userId: z.string(),
  }),
  maxFileSize: 10 * 1024 * 1024,
  allowedFileTypes: ["image/png", "image/jpeg"],
});

export const api = storage.api;
export const handler = storage.handler;
```

### Next.js App Router handler

```ts
import { toNextJsRouteHandler } from "vs3";
import { handler } from "./storage";

export const { GET, POST, OPTIONS } = toNextJsRouteHandler({ handler });
```

### React client hook

```tsx
import { createStorageClient } from "vs3/react";
import z from "zod";

const client = createStorageClient({
  baseURL: "https://myapp.com",
  apiPath: "/api/storage",
  metadataSchema: z.object({ userId: z.string() }),
  maxFileSize: 10 * 1024 * 1024,
  allowedFileTypes: ["image/png", "image/jpeg"],
});

export function UploadButton() {
  const { state, upload } = client.useUpload();

  return (
    <input
      type="file"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void upload(file, { userId: "user-123" });
      }}
    />
  );
}
```

### Direct server-side upload URL

```ts
import { api } from "./storage";

const { presignedUrl, uploadHeaders } = await api.uploadUrl({
  body: {
    fileInfo: { name: "photo.png", size: 123, contentType: "image/png" },
    metadata: { userId: "user-123" },
    encryption: { type: "SSE-S3" },
  },
});

await fetch(presignedUrl, {
  method: "PUT",
  body: file,
  headers: uploadHeaders,
});
```

## API Reference

### From `vs3`

- `createStorage(options)`
- `createStorage(options).api.uploadUrl({ body })`
- `createStorage(options).handler(req)`
- `aws({ client, bucket? })`
- `toNextJsRouteHandler({ handler })`
- `createStorageMiddleware(config, handler)`
- `createVerifySignatureMiddleware(config)`
- `createClientRequestSigner(config)`
- `createRateLimitMiddleware(config)`
- `createInMemoryRateLimitStore()`
- `createCorsMiddleware(config)`
- `createLoggingMiddleware(config)`
- `createTimeoutMiddleware(config)`
- `createMaxSizeValidator(bytes)`
- `createMinSizeValidator(bytes)`
- `createContentTypeValidator(types)`
- `createExtensionValidator(extensions)`
- `createFilenamePatternValidator(regex)`
- `createValidator(config)`
- `combineValidators(validators)`
- `runContentValidators(input, options)`
- `createRequestSigner(config)`
- `createInMemoryNonceStore()`
- `generateNonce()`

### From `vs3/adapters`

- `generateObjectKey(fileInfo)`

### From `vs3/react`

- `createStorageClient(options)`
- `createStorageClient(...).useUpload(options?)`

### From `vs3/integrations/next-js`

- `toNextJsRouteHandler({ handler })`

## Examples

### Middleware chain

```ts
import {
  createStorage,
  createVerifySignatureMiddleware,
  createRateLimitMiddleware,
  createInMemoryRateLimitStore,
  createLoggingMiddleware,
} from "vs3";

const storage = createStorage({
  bucket: "my-bucket",
  adapter: myAdapter,
  middlewares: [
    createLoggingMiddleware({ logger: (entry) => { void entry; } }),
    createVerifySignatureMiddleware({ secret: process.env.SIGNING_SECRET! }),
    createRateLimitMiddleware({
      maxRequests: 100,
      windowMs: 60_000,
      store: createInMemoryRateLimitStore(),
    }),
  ],
});
```

### Custom object keys

```ts
const storage = createStorage({
  bucket: "my-bucket",
  adapter: myAdapter,
  generateKey: async (fileInfo, metadata) => {
    return `${metadata.userId}/${crypto.randomUUID()}-${fileInfo.name}`;
  },
});
```

## Repository Layout

- `packages/vs3` is the core library.
- `apps/docs` contains documentation content.

## Versioning

VS3 follows Semantic Versioning. See `apps/docs/content/docs/internal/versioning.md` for details.

## License

MIT. See `LICENSE`.
