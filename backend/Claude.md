### Design Principles

**Mandatory for all code generation, planning, and implementation.** Every plan
and every change — new feature, refactor, or bug fix — must be checked against
these principles before it is proposed or written. They are not optional style
preferences; treat a violation the same way you treat a lint error.

- **SOLID**
  - _Single Responsibility_: one module, one reason to change. A service owns one
    domain concern; a controller only validates, delegates, and formats.
  - _Open/Closed_: extend behavior by adding (a new service function, a new
    handler, a new strategy) rather than editing stable code paths.
  - _Liskov Substitution_: anything that implements an interface or provider
    contract (e.g. queue providers) must be a drop-in replacement.
  - _Interface Segregation_: expose narrow, purpose-specific interfaces; do not
    force callers to depend on methods they do not use.
  - _Dependency Inversion_: depend on abstractions (injected clients, provider
    interfaces), not on concrete implementations, so they can be swapped and
    mocked in tests.
- **DRY (Don't Repeat Yourself)**: before writing a helper, validator, mapper, or
  query, search for an existing one (`src/utils/`, `src/services/`,
  `src/schemas/`) and reuse or extend it. Duplicated logic is a defect, not a
  shortcut.
- **KISS (Keep It Simple)**: prefer the simplest design that solves the problem.
  No speculative abstractions, no extra layers, no clever indirection when a
  plain function will do.
- **YAGNI (You Aren't Gonna Need It)**: implement only what the current task
  requires. Do not add configuration flags, optional parameters, generic
  utilities, or "future-proof" hooks that nothing uses yet.

When a request conflicts with one of these principles, say so explicitly in the
plan and propose the compliant alternative before implementing.

- **Type Safety**: Use TypeScript strictly. Avoid `any`.
- **Error Handling**: Implement robust error handling with appropriate status codes and messages.
- **types, interfaces, schemas, routes, and controller** the code should be organized in a way that the types, schemas, routes, and controller are in the same file. Use zod for schema validation. 
- **database** Use drizzle for database operations. 