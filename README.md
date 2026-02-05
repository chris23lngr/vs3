# VS3

> A type-safe, route-aware file storage library for TypeScript with runtime metadata validation

VS3 is a modern file storage abstraction that brings type safety and developer experience to cloud storage operations. It works seamlessly with AWS S3, Cloudflare R2, and any S3-compatible storage service.

## Features

- **Type-Safe Routes** - Define multiple upload routes with route-specific metadata schemas
- **Runtime Validation** - Automatic validation using Zod, Valibot, ArkType, or any StandardSchemaV1 library
- **Universal Compatibility** - Works with AWS S3, Cloudflare R2, MinIO, and other S3-compatible services
- **Client & Server** - Full-stack solution with dedicated client and server APIs
- **React Integration** - Built-in hooks and stores for React applications
- **Presigned URLs** - Secure, direct-to-storage uploads without proxy servers
- **Framework Agnostic** - Use with any Node.js framework or edge runtime

## Support Matrix

See the full support matrix in `docs/support-matrix.md`.

Summary:

- Node.js 18, 20, 22
- Chrome, Firefox, Safari, Edge (last 2 versions)
- Runtimes: Node.js, Edge Runtime, Cloudflare Workers, React Native
- TypeScript 5.0+
- Providers: AWS S3, MinIO, Cloudflare R2, Wasabi, Backblaze B2, DigitalOcean Spaces, Google Cloud Storage (S3 mode), Azure Blob Storage (S3 mode)

## Installation

```bash
npm install vs3
# or
pnpm add vs3
# or
yarn add vs3
```

### Peer Dependencies

For AWS S3 support, install the AWS SDK:

```bash
npm install @aws-sdk/client-s3
```

For React integration:

```bash
npm install react
```

## Quick Start

### Server Setup

```typescript
import { createStorage, aws } from 'vs3';
import { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

// Configure storage with type-safe routes
const storage = createStorage({
  bucket: 'my-app-uploads',
  adapter: aws({
    client: new S3Client({
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    }),
  }),
  routes: {
    // Profile images with user metadata
    profile: {
      maxFileSize: 5 * 1024 * 1024, // 5MB
      metadata: z.object({
        userId: z.string().uuid(),
        username: z.string().min(3),
      }),
    },
    // Documents with validation
    documents: {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      metadata: z.object({
        documentType: z.enum(['contract', 'invoice', 'report']),
        caseId: z.string(),
      }),
    },
    // Public files without metadata
    public: {
      maxFileSize: 10 * 1024 * 1024,
    },
  },
});

// Use in your API routes (Express, Hono, Next.js, etc.)
app.use('/api/storage/*', storage.handler);
```

### Client Usage

```typescript
import { createStorageClient } from 'vs3/client';

const client = createStorageClient({
  baseURL: 'https://api.example.com/storage',
});

// Upload with type-safe metadata
const result = await client.profile.uploadUrl(
  { file: avatarFile },
  {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    username: 'johndoe',
  }
);

// TypeScript knows the exact metadata shape required for each route
```

### React Integration

```typescript
import { useStorageUpload } from 'vs3/client/react';

function ProfileUploader() {
  const { upload, uploading, progress, error } = useStorageUpload('profile');

  const handleUpload = async (file: File) => {
    const result = await upload(
      { file },
      {
        userId: currentUser.id,
        username: currentUser.name,
      }
    );

    if (result) {
      console.log('Uploaded:', result.url);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
        disabled={uploading}
      />
      {uploading && <progress value={progress} max={100} />}
      {error && <p>Error: {error.message}</p>}
    </div>
  );
}
```

## API Reference

### Server API

#### `createStorage(options)`

Creates a storage instance with configured routes.

**Options:**

- `bucket` - The S3 bucket name
- `adapter` - Storage adapter (AWS, R2, or custom)
- `baseUrl?` - Base URL for file access
- `routes?` - Route configurations with metadata schemas
- `metadataSchema?` - Global metadata schema for simple use cases

**Route Configuration:**

```typescript
{
  routes: {
    [routeName]: {
      maxFileSize?: number;           // Maximum file size in bytes
      metadata?: StandardSchemaV1;     // Metadata validation schema
      allowedMimeTypes?: string[];     // Allowed MIME types
      path?: string;                   // Custom storage path
    }
  }
}
```

#### `storage.api`

Access to type-safe route endpoints:

- `storage.api.[route].uploadUrl()` - Generate presigned upload URL
- `storage.api.[route].download()` - Download a file
- `storage.api.[route].delete()` - Delete a file

#### `storage.handler`

Request handler for integration with your web framework.

### Client API

#### `createStorageClient(options)`

Creates a client for interacting with your storage API.

**Options:**

- `baseURL` - Base URL of your storage API
- `headers?` - Custom headers for requests
- `hooks?` - Request/response lifecycle hooks

**Methods:**

```typescript
// Upload with presigned URL
await client.[route].uploadUrl(
  { file: File },
  metadata  // Type-safe metadata based on route schema
);

// Direct upload
await client.[route].upload(
  { file: File },
  metadata
);

// Download file
const blob = await client.[route].download({ key: 'file-key' });

// Delete file
await client.[route].delete({ key: 'file-key' });
```

### React Hooks

#### `useStorageUpload(route, options?)`

Hook for file uploads with progress tracking.

**Returns:**

```typescript
{
  upload: (input, metadata) => Promise<Result>;
  uploading: boolean;
  progress: number;        // 0-100
  error: Error | null;
  reset: () => void;
}
```

#### `useStorageStore()`

Access to the global storage state store.

## Schema Libraries Support

VS3 supports any validation library that implements StandardSchemaV1:

### Zod

```typescript
import { z } from 'zod';

metadataSchema: z.object({
  userId: z.string().uuid(),
  tags: z.array(z.string()),
})
```

### Valibot

```typescript
import * as v from 'valibot';

metadataSchema: v.object({
  userId: v.string(),
  tags: v.array(v.string()),
})
```

### ArkType

```typescript
import { type } from 'arktype';

metadataSchema: type({
  userId: 'string',
  'tags?': 'string[]',
})
```

## Examples

Check the `/packages/vs3/examples` directory for complete examples:

- `route-aware-usage.ts` - Route-based uploads with metadata
- `different-libraries.ts` - Using different schema validation libraries

## Adapters

### AWS Adapter

```typescript
import { aws } from 'vs3';
import { S3Client } from '@aws-sdk/client-s3';

adapter: aws({
  client: new S3Client({ region: 'us-east-1' }),
})
```

### Custom Adapter

Implement your own adapter for any storage service:

```typescript
interface Adapter {
  upload(key: string, file: File): Promise<UploadResult>;
  download(key: string): Promise<Blob>;
  delete(key: string): Promise<void>;
  generatePresignedUrl(key: string, metadata?: unknown): Promise<string>;
}
```

## Type Safety

VS3 provides complete type safety throughout the stack:

- **Compile-time route validation** - TypeScript errors for invalid routes
- **Metadata type inference** - Exact metadata types per route
- **Runtime validation** - Zod/Valibot/ArkType validation
- **End-to-end types** - From server to client to React

```typescript
// TypeScript will error if:
// - Route doesn't exist
// - Metadata is missing or incorrect type
// - Metadata contains extra properties

await client.profile.uploadUrl(
  { file },
  { userId: '...', username: '...' }  // ✓ Exact shape required
);

await client.profile.uploadUrl(
  { file },
  { userId: '...' }  // ✗ Missing 'username'
);

await client.public.uploadUrl(
  { file },
  { extra: 'data' }  // ✗ No metadata expected
);
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Development

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run linting
pnpm lint

# Format code
pnpm format
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
