# VS3 Middleware System Redesign - Implementation Plan

## Executive Summary

Redesign VS3's middleware system from a single monolithic signature verification middleware (499 lines) to a **composable, type-safe, and extensible middleware architecture** that integrates seamlessly with better-call while strictly following architectural rules from `ai/RULES.md` and `ai/ROLE_ARCHITECT.md`.

## Current Problems

1. **No Composition**: Cannot chain multiple middlewares together
2. **Poor Extensibility**: Only 2 extension points (authHook, onVerificationFailure); adding new middleware requires core modifications
3. **Limited Scalability**: In-memory nonce store unsuitable for distributed deployments
4. **Weak Type Safety**: Uses generic `Request` type, no typed context flow through middleware chain
5. **Manual Application**: Middlewares must be manually applied; not integrated with routing system
6. **Monolithic Design**: Single 499-line file handling all concerns; hard to maintain and test

## Design Principles (from ai/RULES.md & ai/ROLE_ARCHITECT.md)

✅ **Strict TypeScript**: No `any`, no `@ts-ignore`, explicit return types on public APIs
✅ **Small Functions**: Max 40 lines per function, max 3 parameters
✅ **Correctness > Performance > Convenience**
✅ **Composition Over Inheritance**: Middleware chain pattern
✅ **Dependency Injection**: Testable, mockable components
✅ **Clear Boundaries**: Explicit contracts via TypeScript types
✅ **Typed Errors**: StorageErrorCode enum for all failures

## Architecture Overview

### Core Middleware Types

```typescript
// Core middleware context type - extends better-call's EndpointContext
export type StorageMiddlewareContext<C = {}> = EndpointContext & {
  method: string;
  path: string;
  request: Request;
  headers: Headers;
  context: StorageContext & C; // Accumulated context from previous middlewares
};

// Middleware handler - returns context object to merge into accumulated context
export type MiddlewareHandler<TContext = {}, TResult = {}> = (
  ctx: StorageMiddlewareContext<TContext>
) => Promise<TResult | void>;

// Middleware configuration
export type MiddlewareConfig = {
  name: string;              // For debugging and error messages
  skipPaths?: string[];      // Paths to skip
  includePaths?: string[];   // Paths to include (mutually exclusive with skipPaths)
};

// Complete middleware definition
export type StorageMiddleware<TContext = {}, TResult = {}> = {
  config: MiddlewareConfig;
  handler: MiddlewareHandler<TContext, TResult>;
};
```

### Factory Pattern

```typescript
// Simple factory function for creating middlewares
export function createStorageMiddleware<TContext = {}, TResult = {}>(
  config: MiddlewareConfig,
  handler: MiddlewareHandler<TContext, TResult>
): StorageMiddleware<TContext, TResult>;
```

### Chain Execution

```typescript
// Executes middleware chain sequentially, merging context
export async function executeMiddlewareChain<TResult = {}>(
  middlewares: StorageMiddleware[],
  initialContext: StorageMiddlewareContext
): Promise<ChainExecutionResult<TResult>>;
```

### Integration Point

```typescript
// Update createStorageEndpoint to accept VS3 middlewares
export type StorageEndpointOptions<M> = EndpointOptions & {
  // ... existing options
  middlewares?: StorageMiddleware[]; // ← NEW: VS3 middleware chain
};
```

## Implementation Phases

### Phase 1: Core Middleware Infrastructure (Completed)

**Goal**: Build the middleware system foundation without breaking existing code.

#### Files to Create

1. **`/packages/vs3/src/middleware/types.ts`** (60 lines)
   - `StorageMiddlewareContext<C>` - Context type with generics for type-safe composition
   - `MiddlewareHandler<TContext, TResult>` - Handler function signature
   - `MiddlewareConfig` - Configuration options (name, skipPaths, includePaths)
   - `StorageMiddleware<TContext, TResult>` - Complete middleware definition
   - `ChainExecutionResult<T>` - Result from chain execution

2. **`/packages/vs3/src/middleware/core/create-middleware.ts`** (15 lines)
   - `createStorageMiddleware()` - Factory function that captures config and handler
   - Max 3 parameters: config, handler (adheres to rules)
   - Returns `StorageMiddleware` object

3. **`/packages/vs3/src/middleware/core/execute-chain.ts`** (~120 lines, split into 4 functions)
   - `shouldSkipPath()` - Path matching logic (~15 lines)
   - `mergeContext()` - Context merging with type safety (~10 lines)
   - `executeMiddleware()` - Single middleware execution with error handling (~25 lines)
   - `createMiddlewareError()` - Error wrapping utility (~20 lines)
   - `executeMiddlewareChain()` - Main chain executor (~40 lines)
   - All functions stay under 40 line limit

4. **`/packages/vs3/src/middleware/core/index.ts`** (5 lines)
   - Re-exports from create-middleware and execute-chain

#### Files to Modify

5. **`/packages/vs3/src/api/create-storage-endpoint.ts`** (~15 line change)
   - Add `middlewares?: StorageMiddleware[]` to `StorageEndpointOptions`
   - Update better-call middleware (line 98) to execute VS3 middleware chain:
     ```typescript
     use: [
       createMiddleware(async (betterCallCtx) => {
         if (middlewares && middlewares.length > 0) {
           const storageCtx: StorageMiddlewareContext = {
             ...betterCallCtx,
             method: betterCallCtx.method,
             path: betterCallCtx.path,
             request: betterCallCtx.request!,
             headers: betterCallCtx.headers!,
             context: {} as StorageContext,
           };
           const { context } = await executeMiddlewareChain(middlewares, storageCtx);
           return context;
         }
         return {} as StorageContext;
       }),
     ],
     ```

#### Existing Functions to Reuse

- `createEndpoint()` from better-call (line 93 in create-storage-endpoint.ts)
- `createMiddleware()` from better-call (line 98)
- `runWithEndpointContext()` for context injection (line 104)

#### Testing

Create **`/packages/vs3/src/middleware/__tests__/core.test.ts`**:
- Test `createStorageMiddleware()` factory
- Test `executeMiddlewareChain()` sequential execution
- Test context merging behavior
- Test path skipping (skipPaths, includePaths)
- Test error handling and wrapping

### Phase 2: Refactor Signature Verification Middleware (Completed)

**Goal**: Break down 499-line monolith into composable, testable functions.

#### Files to Create

1. **`/packages/vs3/src/middleware/signature/types.ts`** (40 lines)
   - Move `VerifySignatureMiddlewareConfig` here
   - Add `SignatureVerificationResult` type
   - Add internal types: `SignatureData`, `VerificationContext`

2. **`/packages/vs3/src/middleware/signature/extract-signature.ts`** (~35 lines)
   - Extract `extractSignatureData()` function
   - Validates headers: x-signature, x-timestamp, x-nonce
   - Returns `SignatureData` object
   - Throws typed errors for missing/invalid headers

3. **`/packages/vs3/src/middleware/signature/verify-request.ts`** (~40 lines)
   - Extract `verifyRequestSignature()` function
   - Uses `createRequestSigner()` from existing code
   - Verifies signature using constant-time comparison
   - Validates timestamp within tolerance
   - Validates nonce (if required) via `NonceStore`

4. **`/packages/vs3/src/middleware/signature/auth-hook.ts`** (~30 lines)
   - Extract `runAuthHookValidation()` function
   - Calls optional `AuthHook` with context
   - Returns auth result or throws on failure

5. **`/packages/vs3/src/middleware/signature/errors.ts`** (~40 lines)
   - Extract `createVerificationError()` function
   - Uses existing `VERIFICATION_ERROR_MAP` pattern
   - Maps `VerificationFailureReason` to `StorageErrorCode`
   - Handles `onVerificationFailure` callback

6. **`/packages/vs3/src/middleware/signature/verify-signature.ts`** (~40 lines, REFACTORED)
   - Main middleware factory: `createVerifySignatureMiddleware()`
   - Orchestrates extraction, verification, and auth hook
   - Returns `StorageMiddleware` using `createStorageMiddleware()`
   - Context includes: `{ signature: SignatureVerificationResult }`

7. **`/packages/vs3/src/middleware/signature/index.ts`** (10 lines)
   - Public API exports

#### Existing Code to Preserve

- `createRequestSigner()` from `/src/core/security/request-signer.ts` - reuse as-is
- `createInMemoryNonceStore()` - reuse as-is
- `NonceStore`, `AuthHook`, `RequestSigningConfig` types from `/src/types/security.ts`
- `VERIFICATION_ERROR_MAP` pattern - migrate to errors.ts

#### Files to Modify

8. **`/packages/vs3/src/middleware/index.ts`**
   - Export new middleware system alongside old API (backward compatibility):
     ```typescript
     // New API
     export { createStorageMiddleware } from "./core/create-middleware";
     export { executeMiddlewareChain } from "./core/execute-chain";
     export { createVerifySignatureMiddleware } from "./signature/verify-signature";
     export type * from "./types";

     // Deprecated: Old standalone API (keep for migration period)
     export { createVerifySignatureMiddleware as createVerifySignatureMiddleware_DEPRECATED } from "./verify-signature";
     ```

#### Testing

Update **`/packages/vs3/src/middleware/__tests__/verify-signature.test.ts`** (550 lines):
- Migrate all 20+ test cases to new architecture
- Test individual functions: `extractSignatureData()`, `verifyRequestSignature()`, `runAuthHookValidation()`
- Test full middleware integration via `createVerifySignatureMiddleware()`
- Maintain same test coverage (comprehensive test suite is excellent!)
- Add new tests for middleware-specific behavior (path skipping, context merging)

### Phase 3: Pluggable Nonce Stores (Postponed)

**Goal**: Support distributed deployments with pluggable storage backends.

#### Files to Create

1. **`/packages/vs3/src/middleware/signature/nonce-stores/memory.ts`** (~30 lines)
   - Move `createInMemoryNonceStore()` from request-signer.ts
   - Keep implementation identical
   - Add JSDoc warning about single-server limitation

2. **`/packages/vs3/src/middleware/signature/nonce-stores/redis.ts`** (~35 lines)
   - `createRedisNonceStore(config: { client: RedisClient, keyPrefix?: string })`
   - Uses Redis `SET key value PX ttl NX` for atomic add-if-not-exists
   - Implements `NonceStore` interface
   - No cleanup needed (Redis handles TTL automatically)

3. **`/packages/vs3/src/middleware/signature/nonce-stores/index.ts`** (5 lines)
   - Export all nonce stores

#### Testing

Create **`/packages/vs3/src/middleware/__tests__/nonce-stores.test.ts`**:
- Test memory store (migrate existing tests)
- Test Redis store with mock Redis client
- Test TTL behavior
- Test replay attack prevention

### Phase 4: Common Middlewares Library (Completed)

**Goal**: Provide reusable middlewares for common use cases.

#### Files to Create

1. **`/packages/vs3/src/middleware/common/rate-limit.ts`** (~40 lines)
   - `createRateLimitMiddleware(config)` - Token bucket rate limiting
   - Context: `{ rateLimit: { remaining: number } }`
   - Throws `StorageErrorCode.FORBIDDEN` on limit exceeded

2. **`/packages/vs3/src/middleware/common/cors.ts`** (~35 lines)
   - `createCorsMiddleware(config)` - CORS headers
   - Sets Access-Control-* headers based on config
   - No context modification (returns void)

3. **`/packages/vs3/src/middleware/common/logging.ts`** (~25 lines)
   - `createLoggingMiddleware(config)` - Request logging
   - Logs method, path, duration
   - No context modification

4. **`/packages/vs3/src/middleware/common/timeout.ts`** (~30 lines)
   - `createTimeoutMiddleware(config)` - Request timeout
   - Uses AbortSignal to cancel long requests
   - Throws `StorageErrorCode.TIMEOUT` on expiration

5. **`/packages/vs3/src/middleware/common/index.ts`** (8 lines)
   - Export all common middlewares

#### Testing

Create **`/packages/vs3/src/middleware/__tests__/common.test.ts`**:
- Test rate limiting with various configurations
- Test CORS header setting
- Test logging output
- Test timeout behavior

### Phase 5: Middleware Composition & Presets

**Goal**: Make it easy to compose multiple middlewares.

#### Files to Create

1. **`/packages/vs3/src/middleware/presets/secure.ts`** (~40 lines)
   - `createSecureMiddlewareStack(config)` - Pre-configured security stack
   - Combines: signature verification, rate limiting, CORS
   - Returns `StorageMiddleware[]` ready to use

2. **`/packages/vs3/src/middleware/presets/index.ts`** (5 lines)
   - Export presets

#### Update Public API

3. **`/packages/vs3/src/index.ts`**
   - Export new middleware system:
     ```typescript
     export {
       createStorageMiddleware,
       createVerifySignatureMiddleware,
       createRateLimitMiddleware,
       createCorsMiddleware,
       createSecureMiddlewareStack,
     } from "./middleware";
     ```

## Migration Strategy

There needs to be no migration strategy for the old API to the new API. The package has not been released yet so we can change the API as we please and implement breaking changes as we want.


### Deprecation Timeline

- **Week 1-2**: Implement core system, maintain full backward compatibility
- **Week 3**: Add deprecation warnings to old standalone API
- **Week 4+**: Migrate internal usage to new system
- **Future**: Remove deprecated standalone API in next major version

## Error Handling

All middleware errors flow through typed error codes:

```typescript
// Add to StorageErrorCode enum in /src/core/error/codes.ts
export enum StorageErrorCode {
  // ... existing codes

  // Middleware errors
  MIDDLEWARE_FAILED = "MIDDLEWARE_FAILED",
  MIDDLEWARE_TIMEOUT = "MIDDLEWARE_TIMEOUT",

  // Existing signature errors continue to work
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  TIMESTAMP_EXPIRED = "TIMESTAMP_EXPIRED",
  NONCE_MISSING = "NONCE_MISSING",
  NONCE_REUSED = "NONCE_REUSED",
}
```

Error wrapping in chain executor:
1. `StorageServerError` - passed through unchanged
2. `Response` - passed through (custom responses)
3. Other errors - wrapped with middleware name in details

## Type Safety Guarantees

### Context Type Flow

```typescript
// Middleware 1 adds signature context
const m1 = createVerifySignatureMiddleware({ ... });
// Type: StorageMiddleware<{}, { signature: SignatureVerificationResult }>

// Middleware 2 can access previous context and add more
const m2 = createStorageMiddleware({ name: "m2" }, async (ctx) => {
  const userId = ctx.context.signature.auth?.userId; // ✅ Type-safe!
  return { custom: { data: "value" } };
});

// Handler receives merged context
createStorageEndpoint("/upload", {
  middlewares: [m1, m2],
}, async (ctx) => {
  ctx.context.signature.verified;  // ✅ Type-safe!
  ctx.context.custom.data;         // ✅ Type-safe!
});
```

### No Runtime Type Assertions

- No `as any` casts in implementation
- All type conversions are safe and justified
- Context merging uses spread operator with proper typing

## Critical Files Summary

### New Files (8 core + 9 additional = 17 total)

**Core Infrastructure (Phase 1)**
- `/packages/vs3/src/middleware/types.ts` - Core type definitions
- `/packages/vs3/src/middleware/core/create-middleware.ts` - Factory function
- `/packages/vs3/src/middleware/core/execute-chain.ts` - Chain executor
- `/packages/vs3/src/middleware/core/index.ts` - Core exports

**Signature Verification (Phase 2)**
- `/packages/vs3/src/middleware/signature/types.ts` - Signature types
- `/packages/vs3/src/middleware/signature/extract-signature.ts` - Header extraction
- `/packages/vs3/src/middleware/signature/verify-request.ts` - Signature verification
- `/packages/vs3/src/middleware/signature/auth-hook.ts` - Auth hook execution
- `/packages/vs3/src/middleware/signature/errors.ts` - Error handling
- `/packages/vs3/src/middleware/signature/verify-signature.ts` - Main middleware (refactored)
- `/packages/vs3/src/middleware/signature/index.ts` - Signature exports

**Nonce Stores (Phase 3)**
- `/packages/vs3/src/middleware/signature/nonce-stores/memory.ts` - Memory store
- `/packages/vs3/src/middleware/signature/nonce-stores/redis.ts` - Redis store
- `/packages/vs3/src/middleware/signature/nonce-stores/index.ts` - Store exports

**Common Middlewares (Phase 4)**
- `/packages/vs3/src/middleware/common/rate-limit.ts` - Rate limiting
- `/packages/vs3/src/middleware/common/cors.ts` - CORS
- `/packages/vs3/src/middleware/common/logging.ts` - Logging
- `/packages/vs3/src/middleware/common/timeout.ts` - Timeouts
- `/packages/vs3/src/middleware/common/index.ts` - Common exports

**Presets (Phase 5)**
- `/packages/vs3/src/middleware/presets/secure.ts` - Secure stack preset
- `/packages/vs3/src/middleware/presets/index.ts` - Preset exports

### Modified Files (3)

- `/packages/vs3/src/api/create-storage-endpoint.ts` - Add middleware support (~15 lines)
- `/packages/vs3/src/middleware/index.ts` - Update exports
- `/packages/vs3/src/index.ts` - Public API exports

### Test Files (4)

- `/packages/vs3/src/middleware/__tests__/core.test.ts` - Core infrastructure tests
- `/packages/vs3/src/middleware/__tests__/verify-signature.test.ts` - Migrate 550 lines of existing tests
- `/packages/vs3/src/middleware/__tests__/nonce-stores.test.ts` - Nonce store tests
- `/packages/vs3/src/middleware/__tests__/common.test.ts` - Common middleware tests

## Verification & Testing

### End-to-End Verification

1. **Basic Middleware Chain**
   ```typescript
   const endpoint = createStorageEndpoint("/test", {
     middlewares: [
       createLoggingMiddleware(),
       createVerifySignatureMiddleware({ secret: "test" }),
       createRateLimitMiddleware({ maxRequests: 10, windowMs: 60000, store: memStore }),
     ],
   }, async (ctx) => {
     return { success: true, verified: ctx.context.signature.verified };
   });

   // Test with signed request
   const result = await endpoint(signedRequest);
   expect(result.verified).toBe(true);
   ```

2. **Custom Middleware**
   ```typescript
   const customMiddleware = createStorageMiddleware(
     { name: "custom" },
     async (ctx) => {
       return { custom: { value: "test" } };
     }
   );

   // Verify context merging
   const endpoint = createStorageEndpoint("/test", {
     middlewares: [customMiddleware],
   }, async (ctx) => {
     return { custom: ctx.context.custom.value };
   });
   ```

3. **Path Skipping**
   ```typescript
   const middleware = createVerifySignatureMiddleware({
     secret: "test",
     skipPaths: ["/health"],
   });

   // Verify /health skips verification
   const healthEndpoint = createStorageEndpoint("/health", {
     middlewares: [middleware],
   }, async () => ({ status: "ok" }));
   ```

4. **Error Handling**
   ```typescript
   // Verify errors propagate correctly
   try {
     await endpoint(unsignedRequest);
   } catch (error) {
     expect(error).toBeInstanceOf(StorageServerError);
     expect(error.code).toBe(StorageErrorCode.SIGNATURE_MISSING);
   }
   ```

### Test Coverage Goals

- Core infrastructure: 100% (all functions are pure and testable)
- Signature verification: Maintain existing ~95% coverage
- Common middlewares: 90%+ coverage
- Integration tests: Cover all usage patterns

### Run Tests

```bash
# Run all middleware tests
pnpm test -- src/middleware

# Run specific test file
pnpm test -- verify-signature.test.ts

# Watch mode during development
pnpm test -- --watch src/middleware

# Coverage report
pnpm test -- --coverage src/middleware
```

## Trade-offs & Decisions

### ✅ What We're Optimizing For

1. **Type Safety** - Full TypeScript inference, no `any`, context flows properly
2. **Composability** - Easy to chain middlewares, reuse logic
3. **Testability** - Small pure functions, dependency injection, easy mocking
4. **Maintainability** - Functions under 40 lines, clear separation of concerns
5. **Extensibility** - Plugin system for custom middlewares
6. **Developer Experience** - Clear APIs, helpful errors, familiar patterns

### ⚠️ What We're Giving Up

1. **Simplicity** - More abstraction than standalone function
2. **Bundle Size** - +2-3KB for infrastructure (acceptable for gained flexibility)
3. **Performance** - ~1-2ms overhead per request (negligible vs 10-100ms for crypto)
4. **Learning Curve** - Developers need to learn middleware pattern

### Why These Trade-offs Make Sense

- Trade-offs favor long-term maintainability over short-term simplicity
- Bundle size increase is negligible for modern apps
- Performance overhead is < 2% of total request time
- Middleware pattern is industry standard (Express, Koa, Next.js)

## Success Metrics

✅ **Functional Requirements**
- [ ] Middleware chain executes in correct order
- [ ] Context merges correctly between middlewares
- [ ] Path skipping works (skipPaths, includePaths)
- [ ] Errors propagate with proper context
- [ ] Backward compatibility maintained

✅ **Non-Functional Requirements**
- [ ] All functions ≤ 40 lines
- [ ] All functions ≤ 3 parameters
- [ ] No `any` or `@ts-ignore`
- [ ] Test coverage ≥ 90%
- [ ] Type inference works without manual annotations

✅ **Developer Experience**
- [ ] Clear error messages with middleware name
- [ ] Easy to create custom middlewares (< 10 lines)
- [ ] Composable preset stacks available
- [ ] Migration path documented


