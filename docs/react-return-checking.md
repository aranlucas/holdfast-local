# React effect return checking

React already contextually types effect callbacks as returning nothing or a cleanup function. Do not add explicit `void | (() => void)` annotations to satisfy lint.

TypeScript `noImplicitReturns` now checks the application, including ordinary value-returning functions. React still rejects numeric or asynchronous effect returns. The compiler regressions in `test/return-types.test.mjs` exercise both contracts.

The installed Oxforge version enables `typescript/consistent-return`, which incorrectly rejects inferred optional-cleanup effects. One transitional override disables only that duplicate check in the affected effect files; all are included in the TypeScript project. Other lint rules and files retain their existing policy. Remove this override when a shared compiler-owned return-checking preset is available and the dependency can be updated under the existing release-age policy.

Oxlint recommends TypeScript's compiler check over this rule: https://oxc.rs/docs/guide/usage/linter/rules/typescript/consistent-return.html
