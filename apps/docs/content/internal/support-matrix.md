---
title: Support Matrix
description: This document defines the explicit support targets for VS3.
---

# VS3 Support Matrix

This document defines the explicit support targets for VS3. These are **targets** for compatibility and testing, not a guarantee that every feature works identically across every environment.

## Node.js

| Version | Status |
| --- | --- |
| 18.x | Targeted |
| 20.x | Targeted |
| 22.x | Targeted |

## Browsers

Last 2 stable versions:

- Chrome
- Firefox
- Safari
- Edge

## Runtimes

- Node.js
- Edge Runtime
- Cloudflare Workers
- React Native

## TypeScript

- 5.0+

## S3-Compatible Providers

- AWS S3
- MinIO
- Cloudflare R2
- Wasabi
- Backblaze B2
- DigitalOcean Spaces
- Google Cloud Storage (S3 compatibility mode)
- Azure Blob Storage (S3 compatibility mode)

## Notes

- These targets are intended to guide testing and compatibility commitments.
- Provider compatibility depends on each vendor's S3-compatibility surface and configuration.
- Platform-specific limitations will be documented as they are validated.
