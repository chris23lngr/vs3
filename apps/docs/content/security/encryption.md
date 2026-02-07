---
title: S3 Encryption Options
description: Add S3 server-side encryption to your storage by passing encryption options when you create the storage.
---

# S3 Encryption Options

vs3 supports S3 server-side encryption when generating presigned upload URLs.

## Supported Modes

- SSE-S3: S3-managed keys (`AES256`)
- SSE-KMS: AWS KMS-managed keys (`aws:kms`)
- SSE-C: Customer-provided keys (`AES256`)

## Usage (Client Upload)

```typescript
const result = await client.uploadFile(file, { userId: "123" }, {
  encryption: { type: "SSE-S3" },
});
```

```typescript
const result = await client.uploadFile(file, { userId: "123" }, {
  encryption: { type: "SSE-KMS", keyId: "arn:aws:kms:..." },
});
```

```typescript
const result = await client.uploadFile(file, { userId: "123" }, {
  encryption: {
    type: "SSE-C",
    customerKey: "BASE64_KEY",
    customerKeyMd5: "BASE64_MD5",
  },
});
```

## Usage (Custom Upload)

When calling `storage.api.uploadUrl()` directly, the response can include
`uploadHeaders`. These headers must be sent with the upload request to S3.

```typescript
const { presignedUrl, uploadHeaders } = await storage.api.uploadUrl({
  body: {
    fileInfo,
    metadata: { userId: "123" },
    encryption: { type: "SSE-S3" },
  },
});

await fetch(presignedUrl, {
  method: "PUT",
  body: file,
  headers: uploadHeaders,
});
```

## Notes

- SSE-KMS can include an optional `keyId` to target a specific KMS key.
- SSE-C requires the client to provide the encryption key and headers on upload.
- All encryption options are validated at the API boundary.
