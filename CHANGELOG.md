# Changelog

All notable changes to this project are documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## Release Process

1. Update `CHANGELOG.md` under the `Unreleased` section.
1. Bump the version in `packages/vs3/package.json`.
1. Run `pnpm test` and `pnpm -C packages/vs3 build`.
1. Tag the release `vs3-vX.Y.Z`.
1. Publish from `packages/vs3`.

## [Unreleased]

- Initial repository hygiene and documentation scaffolding.

## [1.0.0] - 2026-02-06

- Initial public baseline of the VS3 package.
