# vs3 Documentation Structure (Proposed)

## Goals

- Cover every public `vs3` feature and export path.
- Teach both usage and internals (how requests flow through the system).
- Keep onboarding short while preserving deep reference material.

## Top-Level Information Architecture

1. `Getting Started`
2. `Core Concepts`
3. `Server API`
4. `Client SDKs`
5. `Middleware & Security`
6. `Adapters & Providers`
7. `Framework Integrations`
8. `Recipes`
9. `API Reference`
10. `Troubleshooting`
11. `Migration & Versioning`

## Proposed Navigation Tree

```text
/docs
  /index                         -> Product overview + "choose your path"
  /quickstart                    -> 10-minute setup (server + client)
  /installation                  -> Peer deps, runtime requirements, package entrypoints

  /concepts
    /request-lifecycle           -> upload/download/multipart lifecycle end-to-end
    /type-safety-model           -> metadata schemas, inference, client typing
    /error-model                 -> StorageError categories and handling strategy

  /server
    /create-storage              -> createStorage and returned API (handler, api, $Infer)
    /storage-options             -> all StorageOptions including hooks/generateKey
    /endpoints
      /upload-url                -> request/response, validation, encryption usage
      /download-url              -> request/response, modes, expiry and headers
      /multipart                 -> create/presign/complete/abort contract
    /metadata-schemas            -> Standard Schema support + validation behavior
    /content-validation          -> built-ins and custom validator pipeline
    /hooks                       -> beforeUpload/afterUpload/beforeDownload/afterDownload

  /client
    /overview                    -> base client behavior and request flow
    /react
      /create-storage-client     -> setup and typing
      /use-upload                -> state model, callbacks, retries
      /use-download              -> url/direct-download/preview
      /use-multipart-upload      -> chunking, concurrency, abort, progress
    /vue
      /create-storage-client
      /use-upload
      /use-download
      /use-multipart-upload
    /encryption                  -> passing S3 encryption from client calls
    /error-handling              -> throwOnError, callback patterns, UI patterns

  /middleware
    /overview                    -> middleware chain execution model
    /common
      /cors
      /rate-limit
      /logging
      /timeout
    /auth
      /create-auth-middleware
      /better-auth
    /request-signing
      /server-verification       -> createVerifySignatureMiddleware
      /client-signing            -> createClientRequestSigner
      /nonce-replay-protection   -> createInMemoryNonceStore + nonce strategy
    /custom-middleware           -> createStorageMiddleware patterns

  /adapters
    /overview                    -> adapter contract and when to use createAdapter
    /aws
    /cloudflare-r2
    /minio
    /backblaze-b2
    /digitalocean-spaces
    /wasabi
    /custom-adapter

  /integrations
    /next-js                     -> toNextJsRouteHandler usage and route export
    /nuxt                        -> server route mounting + client usage

  /recipes
    /secure-uploads              -> auth + signing + rate limit
    /tenant-folder-keys          -> generateKey + metadata schema
    /large-file-uploads          -> multipart tuning and resilience
    /private-downloads           -> short-lived URLs + access checks
    /provider-migration          -> switching adapters safely

  /reference
    /exports                     -> root and subpath exports map
    /types                       -> grouped type reference by domain
    /errors                      -> StorageErrorCode table + suggestions
    /http-api                    -> endpoint payloads/status/errors

  /troubleshooting
    /common-errors
    /cors-and-signature-issues
    /multipart-failures

  /migration
    /versioning-policy
    /upgrading-guides
```

## Feature Coverage Matrix

| Feature | Primary Docs Location |
|---|---|
| `createStorage` | `/docs/server/create-storage` |
| `StorageOptions` (`maxFileSize`, `allowedFileTypes`, `metadataSchema`, `generateKey`, `hooks`, `middlewares`, etc.) | `/docs/server/storage-options` |
| Upload/download endpoints | `/docs/server/endpoints` |
| Multipart endpoints and flow | `/docs/server/endpoints/multipart`, `/docs/client/*/use-multipart-upload` |
| React SDK (`vs3/react`) | `/docs/client/react/*` |
| Vue SDK (`vs3/vue`) | `/docs/client/vue/*` |
| Next.js integration (`toNextJsRouteHandler`) | `/docs/integrations/next-js` |
| Adapters (`aws`, `cloudflareR2`, `minio`, `backblazeB2`, `digitaloceanSpaces`, `wasabi`, `createAdapter`) | `/docs/adapters/*` |
| Middleware core and custom middleware | `/docs/middleware/overview`, `/docs/middleware/custom-middleware` |
| Common middleware (`createCorsMiddleware`, `createRateLimitMiddleware`, `createLoggingMiddleware`, `createTimeoutMiddleware`, `createInMemoryRateLimitStore`) | `/docs/middleware/common/*` |
| Auth middleware (`createAuthMiddleware`) and subpath `vs3/middleware/auth` (`betterAuth`, `createBetterAuthMiddleware`) | `/docs/middleware/auth/*` |
| Request signing (`createRequestSigner`, `createClientRequestSigner`, verification middleware, nonce store) | `/docs/middleware/request-signing/*` |
| Content validator helpers (`createMaxSizeValidator`, `createContentTypeValidator`, etc.) | `/docs/server/content-validation` |
| Encryption (`SSE-S3`, `SSE-KMS`, `SSE-C`) | `/docs/client/encryption`, `/docs/server/endpoints/*` |
| Error model (`StorageError`, codes, client/server origin) | `/docs/concepts/error-model`, `/docs/reference/errors` |
| Public exports and subpaths | `/docs/reference/exports` |

## Suggested Reading Paths

1. New user: `index` -> `quickstart` -> `request-lifecycle` -> framework page (`react`/`vue`) -> adapter page.
2. Backend-focused user: `create-storage` -> `storage-options` -> `middleware/overview` -> `request-signing` -> `reference/http-api`.
3. Production hardening: `secure-uploads` -> `cors` -> `rate-limit` -> `errors` -> `troubleshooting/*`.

## Why This Structure

- Separates learning content (`concepts`, `recipes`) from exact contracts (`reference`).
- Mirrors package entrypoints (`vs3`, `vs3/react`, `vs3/vue`, `vs3/adapters`, `vs3/integrations/next-js`, `vs3/middleware/auth`).
- Keeps multipart, security, and middleware as first-class sections because they drive most production complexity.
