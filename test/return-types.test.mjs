import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

const compiler = path.join(root, "node_modules/typescript/bin/tsc");

/** @param {string} source */
function checkTypes(source) {
  const directory = mkdtempSync(path.join(root, ".return-types-"));

  try {
    writeFileSync(path.join(directory, "probe.ts"), source);
    writeFileSync(
      path.join(directory, "tsconfig.json"),
      JSON.stringify({
        extends: path.join(root, "tsconfig.json"),
        compilerOptions: { noEmit: true, types: ["react"] },
        include: ["probe.ts"],
      }),
    );

    const result = spawnSync(process.execPath, [compiler, "--project", directory], {
      cwd: root,
      encoding: "utf8",
    });

    assert.ifError(result.error);

    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("React infers effects with optional cleanup without return annotations", () => {
  const result = checkTypes(`
    import { useEffect } from "react";
    declare const enabled: boolean;
    useEffect(() => {}, []);
    useEffect(() => {
      if (!enabled) return;
      return () => {};
    }, [enabled]);
  `);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("the compiler still catches missing returns and invalid effect callbacks", () => {
  const result = checkTypes(`
    import { useEffect } from "react";
    export function missingReturn(enabled: boolean) {
      if (enabled) return 1;
    }
    useEffect(() => 1, []);
    useEffect(async () => {}, []);
  `);

  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /TS7030: Not all code paths return a value/);
  assert.match(result.stdout, /TS2322: Type 'number'/);
  assert.match(result.stdout, /TS2345: Argument of type '\(\) => Promise<void>'/);
  assert.equal((result.stdout.match(/error TS/g) ?? []).length, 3, result.stdout);
});
