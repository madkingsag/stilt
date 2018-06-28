# ROADMAP

- Automatic transaction creation when reaching a method
    - Resolves when that method completes (the promise it returns resolves).
    - All methods called by this one are executed using the same transaction.
    - wrap methods using `@withTransaction` (creates a transaction if one does not exist).
    - current transaction available using `@withTransaction.current`.
- CLI method to reset Database (with "are you sure" prompt printing `NODE_ENV`)