# Contributing to VS3

Thanks for your interest in contributing. This guide covers how to set up the repo, run checks, and submit changes.

## Requirements

- Node.js 18, 20, or 22
- pnpm

## Setup

```bash
pnpm install
```

## Common Commands

```bash
pnpm -C packages/vs3 typecheck
pnpm -C packages/vs3 test
pnpm -C packages/vs3 build
pnpm -C packages/vs3 lint
```

## Development Workflow

1. Create a branch from `main`.
1. Keep changes focused and minimal.
1. Add or update tests where behavior changes.
1. Ensure `pnpm -C packages/vs3 typecheck` and `pnpm -C packages/vs3 test` pass.
1. Update `CHANGELOG.md` under `Unreleased` if you are changing behavior.

## Code Standards

- TypeScript strict mode only.
- No `any`, `@ts-ignore`, or unhandled `unknown`.
- Prefer small, pure functions.
- Avoid deep nesting.
- Do not introduce new dependencies without prior approval.

## Commit Messages

Use imperative, descriptive commit messages.

Examples:

- `feat: add multipart upload support`
- `fix: handle retry backoff errors`
- `docs: add middleware examples`

## Reporting Issues

- Use clear reproduction steps.
- Include environment details and logs.
- For security issues, see `SECURITY.md`.
