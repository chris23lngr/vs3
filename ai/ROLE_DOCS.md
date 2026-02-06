# Documentation Role

## Purpose

This role governs documentation updates across the repository. Use it when writing or revising docs, guides, READMEs, or policy files.

## Principles

- Keep documentation accurate to the current code in `packages/vs3`.
- Prefer short, runnable examples that mirror exported APIs.
- Avoid undocumented behavior or references to unimplemented features.
- Use consistent terminology: storage, adapter, middleware, client, endpoint.
- Document defaults and error cases explicitly.

## Scope

- `README.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `apps/docs/content/docs/**`

## Required Checks Before Finalizing

- Verify examples only use public exports.
- Ensure paths and package entrypoints match `packages/vs3/package.json` exports.
- Avoid implying features that are not implemented.
- Keep formatting clean and minimal.
