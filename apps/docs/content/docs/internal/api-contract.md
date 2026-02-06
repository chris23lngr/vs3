---
title: API Contract
description: This document defines the public API surface, error/response contracts, and stability guarantees for VS3.
---

# VS3 API Contract

This document defines the **public API surface**, **error/response contracts**, and **stability guarantees** for VS3.

## 1. Public API Surface (Stable)

Only the exports listed below are considered **public and stable**. Anything not listed is **internal** and may change without notice.

### Entry: `vs3`

Exports from `packages/vs3/src/index.ts`:

- `createStorage(options): Storage`
- `aws(options): Adapter`
- `toNextJsRouteHandler(opts): NextJsRouteHandler`
- `Adapter` (type)
- `StorageOptions` (type)
- `Storage` (type)

### Entry: `vs3/adapters`

Exports from `packages/vs3/src/adapters/index.ts`:

- `aws(options): Adapter`
- `generateObjectKey(fileInfo): string`

### Entry: `vs3/integrations/next-js`

Exports from `packages/vs3/src/integrations/next-js.ts`:

- `toNextJsRouteHandler(opts): NextJsRouteHandler`

### Entry: `vs3/react`

Exports from `packages/vs3/src/client/react/index.ts`:

- `createStorageClient(options?): { useUpload: HookFactory }`

## 2. Internal APIs (Unstable)

The following are **internal** and **not** stable:

- Any path not exported by `package.json` `exports`.
- Any module under `packages/vs3/src/api`, `packages/vs3/src/client`, `packages/vs3/src/core`, `packages/vs3/src/context`, or `packages/vs3/src/types`, unless explicitly exported by the public entries above.

Internal APIs may change in any release without deprecation.

## 3. HTTP Endpoint Contract

VS3 currently defines a single storage endpoint in the registry:

### `POST /upload-url`

**Request Body**

```json
{
  "fileInfo": {
    "name": "string",
    "size": 123,
    "contentType": "string"
  },
  "expiresIn": 3600,
  "acl": "public-read"
}
```

**Response Body**

```json
{
  "presignedUrl": "string",
  "key": "string"
}
```

Notes:

- Request schema is defined in `packages/vs3/src/api/registry.ts`.
- Route-specific metadata is validated according to the configured `metadataSchema` in `createStorage`.

## 4. Error Shape Contract

When VS3 surfaces structured errors, they follow this shape:

```json
{
  "origin": "client" | "server",
  "message": "string",
  "code": "StorageErrorCode",
  "details": "unknown",
  "httpStatus": "number",
  "recoverySuggestion": "string"
}
```

- `origin` indicates where the error was created.
- `code` is a stable error identifier (see below).
- `details` may include validation issues or context; it is **not** a stable schema.
- `httpStatus` maps the error to an HTTP status code. If omitted when constructing
  an error, it is populated from the error definitions before serialization.
- `recoverySuggestion` provides a recommended recovery action for clients. If omitted
  when constructing an error, it is populated from the error definitions before
  serialization.

### Error Codes (Versioned)

Current error codes are defined in `packages/vs3/src/core/error/codes.ts`:

| Code | HTTP Status | Description | Recovery Suggestion |
| --- | --- | --- | --- |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server failure. | Retry the request or contact support if it persists. |
| `METADATA_VALIDATION_ERROR` | 400 | Metadata payload failed validation. | Fix metadata fields to match the schema and retry. |
| `NETWORK_ERROR` | 503 | Network request failed before completion. | Check connectivity and retry with backoff. |
| `UNKNOWN_ERROR` | 500 | Unexpected error with unknown cause. | Retry the request or contact support if it persists. |
| `INVALID_FILE_INFO` | 400 | File information failed validation. | Verify file attributes and retry the upload. |
| `FILE_TOO_LARGE` | 413 | File exceeds the configured size limit. | Reduce the file size or raise the configured limit. |
| `FILE_TYPE_NOT_ALLOWED` | 415 | File type is not permitted by configuration. | Upload a file that matches the allowed types. |
| `INVALID_FILENAME` | 400 | Filename contains invalid characters or format. | Rename the file to remove invalid characters or paths. |
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate limit has been exceeded. | Wait before retrying or reduce request volume. |
| `CONTENT_VALIDATION_ERROR` | 422 | Content validators rejected the upload. | Adjust content to satisfy validation rules. |
| `VALIDATION_ERROR` | 400 | Input or configuration failed validation. | Correct the invalid input and retry. |
| `UPLOAD_FAILED` | 502 | Upload failed due to upstream storage error. | Retry the upload or check storage availability. |
| `UPLOAD_TIMEOUT` | 504 | Upload timed out before completion. | Retry with a smaller file or a longer timeout. |
| `ADAPTER_ERROR` | 502 | Storage adapter failed to complete the operation. | Verify adapter configuration and retry. |
| `SERVICE_UNAVAILABLE` | 503 | Service is temporarily unavailable. | Retry later or check service status. |
| `QUOTA_EXCEEDED` | 429 | Storage quota has been exceeded. | Free space or increase quota before retrying. |
| `VIRUS_DETECTED` | 422 | Upload rejected due to malware detection. | Scan the file for malware before retrying. |
| `CONTENT_POLICY_VIOLATION` | 403 | Content violates policy or compliance rules. | Remove prohibited content and retry. |
| `DUPLICATE_FILE` | 409 | Duplicate file detected during upload. | Upload a different file or enable overwrite. |
| `SIGNATURE_MISSING` | 401 | Request signature is missing or malformed. | Include a valid signature header and retry. |
| `SIGNATURE_INVALID` | 401 | Request signature verification failed. | Recompute the signature and retry the request. |
| `SIGNATURE_EXPIRED` | 401 | Request signature has expired. | Generate a new signature and retry quickly. |
| `TIMESTAMP_MISSING` | 400 | Request timestamp is missing or malformed. | Include a valid timestamp and retry. |
| `TIMESTAMP_EXPIRED` | 401 | Request timestamp is outside the acceptable time window. | Sync the client clock and retry with a new timestamp. |
| `NONCE_REUSED` | 409 | Request nonce has already been used. | Generate a fresh nonce for each request. |
| `NONCE_MISSING` | 400 | Request nonce is missing when required. | Include a nonce value and retry. |
| `NONCE_STORE_MISSING` | 500 | Nonce store is missing while nonce is required. | Configure a nonce store and retry. |
| `UNAUTHORIZED` | 401 | Authentication token is missing. | Provide valid authentication credentials. |
| `FORBIDDEN` | 403 | Authentication token is invalid or expired. | Refresh credentials or request access. |
| `NOT_FOUND` | 404 | Requested resource could not be found. | Verify the resource identifier and retry. |
| `CONFLICT` | 409 | Request conflicts with existing resource state. | Resolve the conflict before retrying. |
| `MIDDLEWARE_FAILED` | 500 | A middleware in the chain failed. | Retry or inspect middleware configuration. |
| `MIDDLEWARE_TIMEOUT` | 504 | Middleware execution timed out. | Retry or increase middleware timeout. |

**Versioning policy for error codes**:

- Error codes are stable within a **major** version.
- New error codes may be added in **minor** releases.
- Removing or repurposing a code requires a **major** release.

## 5. Deprecation Policy

- Public APIs are deprecated at least **one major version** before removal.
- Deprecations must include a migration note and replacement guidance.
- Deprecated APIs remain functional until the next major release unless explicitly marked as experimental.

## 6. Compatibility Guarantees

- Public APIs listed in section 1 are stable for the lifetime of a major version.
- Internal APIs are explicitly excluded from compatibility guarantees.
