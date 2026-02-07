---
title: Versioning & Stability Policy
description: This document defines the versioning and stability policy for VS3.
---

# VS3 Versioning & Stability Policy

VS3 follows **Semantic Versioning (SemVer)**: `MAJOR.MINOR.PATCH`.

## 1. Versioning Rules

- **MAJOR**: Breaking changes, removal of deprecated APIs, or behavioral changes that are not backward compatible.
- **MINOR**: New features, new error codes, or backward-compatible behavior improvements.
- **PATCH**: Bug fixes and internal improvements with no API changes.

## 2. Breaking Change Policy

- Breaking changes require a **major** version bump.
- A breaking change includes any of the following:
  - Removing or changing a public API signature.
  - Changing runtime behavior in a way that invalidates existing integrations.
  - Removing or repurposing an existing error code.

## 3. Deprecation Policy

- Public APIs are deprecated at least **one major version** before removal.
- Deprecations must include:
  - Replacement guidance.
  - A brief migration path.
  - Clear release notes.

## 4. LTS Support Policy

- VS3 will support **the latest major** and **the previous major** as LTS.
- LTS support lasts **12 months** from the release of the next major version.
- LTS releases receive critical bug fixes and security patches only.

## 5. Experimental APIs

- Experimental APIs may be introduced under explicit naming or documentation.
- Experimental APIs can change in **minor** releases.
- Experimental APIs are not covered by the stability guarantees of this policy.

## 6. Error Code Stability

- Error codes are stable within a major version.
- New error codes may be added in minor versions.
- Removing or changing an error code meaning requires a major version bump.
