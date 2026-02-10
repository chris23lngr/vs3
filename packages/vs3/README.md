# vs3

Type-safe S3 storage library with presigned uploads, validation, and framework integrations.

## Features

- **Presigned uploads & downloads** — generate presigned URLs for direct client-to-S3 transfers
- **File validation** — content type, extension, size, and filename validation with magic byte detection
- **Type-safe metadata** — define metadata schemas with Zod and get full type inference
- **React hooks** — `useUpload` and `useDownload` hooks with progress tracking
- **Next.js integration** — convert storage handlers to Next.js route handlers
- **Middleware system** — CORS, rate limiting, logging, request signing, and timeout middleware
- **Request signing** — HMAC-based request signing and verification for secure uploads
- **S3 encryption** — SSE-S3, SSE-KMS, and SSE-C encryption support

## Installation

```bash
npm install vs3 @aws-sdk/client-s3
```

## Quick Start

### Server

```typescript
import { S3Client } from "@aws-sdk/client-s3";
import { createStorage, aws } from "vs3";
import { z } from "zod";

const storage = createStorage({
  bucket: "my-bucket",
  apiPath: "/api/storage",
  adapter: aws({
    bucket: "my-bucket",
    client: new S3Client({ region: "us-east-1" }),
  }),
  metadataSchema: z.object({
    userId: z.string(),
  }),
});

// Use storage.handler with your framework
// storage.handler is a (req: Request) => Promise<Response> function
```

### Next.js

```typescript
import { toNextJsRouteHandler } from "vs3";
import { storage } from "./storage";

export const { GET, POST, PUT, DELETE } = toNextJsRouteHandler({
  handler: storage.handler,
});
```

### Client (React)

```typescript
import { createStorageClient } from "vs3/react";
import type { storage } from "./storage";

const client = createStorageClient<typeof storage.$Infer>({
  baseURL: "http://localhost:3000",
  apiPath: "/api/storage",
});

// Keep the import type-only to avoid pulling server code into client bundles.

function UploadForm() {
  const { upload, progress, isUploading } = client.useUpload();

  const handleUpload = async (file: File) => {
    const result = await upload(file, { userId: "user-123" });
    console.log("Uploaded:", result.key);
  };
}
```

### Client (Vanilla)

```typescript
import { createBaseClient } from "vs3";
import type { storage } from "./storage";

const client = createBaseClient<typeof storage.$Infer>({
  baseURL: "http://localhost:3000",
  apiPath: "/api/storage",
});

const result = await client.uploadFile(file, { userId: "user-123" });
```

## Subpath Exports

| Import path              | Description                    |
| ------------------------ | ------------------------------ |
| `vs3`                    | Core: storage, validation, middleware |
| `vs3/react`              | React hooks (`useUpload`, `useDownload`) |
| `vs3/integrations/next-js` | Next.js route handler adapter |
| `vs3/adapters`           | All storage adapters           |
| `vs3/adapters/aws-s3`    | AWS S3 adapter only            |

## Requirements

- Node.js >= 18
- `@aws-sdk/client-s3` as a peer dependency
- `react` >= 18 (optional, for `vs3/react`)

## License

ISC
