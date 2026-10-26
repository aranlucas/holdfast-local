## Scripts: native first

Before adding a script file (`scripts/`, `bin/`, `tools/`, root `*.sh|*.py|*.mjs`) or a package script that runs one, take the first rung that works:

1. A flag or subcommand of a tool the repo already uses (`<tool> --help`).
2. Declarative config for that tool (`vite.config.ts`, `tsconfig.json`, `tsconfig.tooling.json`, `oxfmt.config.ts`, `pnpm-workspace.yaml`, `vitest.config.ts`, `playwright.config.ts`).
3. A maintained plugin for that tool.
4. A one-line package.json script that calls a native command.
5. A test in the existing runner (Vitest and Playwright), for anything that asserts.
6. A custom script, only for behavior specific to this repo. Its first comment names the native rung it couldn't use and why. It has a test in the existing runner, and the PR that adds it quotes that comment.

## Code: libraries first

Before hand-writing general-purpose code, use a well-maintained library: actively released, widely adopted, typed, and a fit for this stack. Reach for one already in the dependencies first. Write custom code for domain logic and for the glue no library covers. A PR that adds a dependency says why it was picked; a PR that hand-writes something a library covers names the library and why it didn't fit.

- IndexedDB persistence → idb.
- Proof packet ZIPs → jszip.
- Backup split ZIP volumes, streaming reads, CRC and decompression size checks → @zip.js/zip.js (native core build).
- PDF text extraction → pdfjs-dist.
- Stored and exported data validation → zod.
