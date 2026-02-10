# vs3 Examples

This folder contains example applications demonstrating how to use `vs3`.

Each example is a standalone app that you can run independently. They use the `vs3` package from the monorepo workspace.

## Available Examples

| Example | Description |
|---------|-------------|
| `template` | Base template for new examples |
| `vue` | Nuxt 3 app using `vs3/vue` composables and a Nitro API route |

## Running Examples

From the repository root:

```bash
# Run a specific example
pnpm --filter "example-with-auth" dev

# Run all examples (in parallel)
pnpm --filter "./examples/*" dev

# Or from the examples folder
pnpm dev
```

## Adding a New Example

1. Copy `examples/template` to a new folder (e.g., `examples/with-auth`)
2. Update the `package.json` name and README
3. Implement the example app
4. Update this README with the new example
