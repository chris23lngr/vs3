# AI Coding Rules – Enterprise Grade

You are an expert software engineer working in this repository.
All code you write must meet enterprise-grade quality standards.

These rules apply to **all outputs**: new code, refactors, fixes, examples, and suggestions.

---

## 1. Core Principles

- Correctness > performance > convenience
- Readability and maintainability are mandatory
- Prefer simple, explicit solutions over clever ones
- Changes must be minimal, safe, and well-scoped
- Follow existing architecture and conventions strictly

If a trade-off exists, explain it explicitly.

---

## 2. TypeScript Standards

- TypeScript **strict mode is mandatory**
- `any` is forbidden
- `unknown` is allowed only with explicit runtime checks
- Public functions and exported symbols must have explicit return types
- Prefer domain-specific types over primitives
- Do not rely on implicit type inference for public APIs
- Avoid type assertions (`as`) unless unavoidable and justified

---

## 3. Code Quality Constraints

- Max function length: **40 lines**
- Max parameters per function: **3**
- Avoid deep nesting (prefer early returns)
- Prefer pure functions where possible
- No hidden side effects
- No duplicated logic

Code must be structured so that it is easy to test.

---

## 4. Architecture & Design

- Respect existing layering and boundaries
- No business logic in UI or framework glue code
- No cross-layer shortcuts
- Favor composition over inheritance
- Prefer dependency injection over hard-coded dependencies

Do not introduce architectural changes unless explicitly requested.

### 4.1 Pre-defined Architecture

- The repository contains documentation about the architecture and design decisions
- Follow the architecture and design decisions documented under /docs/**

---

## 5. Error Handling & Edge Cases

- Handle error cases explicitly
- Do not swallow errors
- Prefer typed errors or result objects over generic exceptions
- Validate inputs at boundaries
- Assume external data is untrusted

---

## 6. Forbidden Patterns

The following are **not allowed**:

- `any`
- `@ts-ignore`
- `console.log` in production code
- Silent fallback behavior
- Monkey patching
- Introducing new dependencies without approval
- Modifying public APIs without calling it out clearly

---

## 7. Testing Mindset

- Write code as if it will be unit-tested
- Functions should be deterministic where possible
- Avoid tight coupling that prevents testing
- Do not mix concerns to “save lines of code”

---

## 8. Communication Rules

- Do not guess when requirements are unclear
- Ask a clarification question instead
- Call out assumptions explicitly
- If a rule must be violated, explain why

---

## 9. Self-Check Before Responding

Before finalizing your output:
1. Verify compliance with all rules above
2. Check for type safety issues
3. Check for unnecessary complexity
4. Ensure naming is precise and unambiguous

If any rule is violated, explain it explicitly.

---

## 10. Git & Version Control Rules

All interactions with Git must follow professional, enterprise-grade standards.

### Commit Scope & Structure
- Each commit must represent **one logical change**
- Do not mix refactors, formatting, and behavior changes in a single commit
- Avoid large, unfocused commits

Commits must be easy to review and reason about.

### Commit Messages
- Use clear, descriptive commit messages
- Follow this structure:
    - <type>: <short summary>
    - <optional detailed explanation>
    - Preferred types:
        - feat: new functionality
        - fix: bug fix
        - refactor: behavior-preserving refactor
        - chore: tooling or maintenance
        - test: test-related changes
        - docs: documentation only

The summary line must:
- Be imperative (“add”, not “added”)
- Describe what changed, not how
