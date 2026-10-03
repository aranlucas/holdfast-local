import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "anti-slop-probe-"));

const executable = resolve("node_modules/.bin/oxlint");

const config = resolve(".oxlintrc.json");

try {
  const valid = join(directory, "valid.ts");

  writeFileSync(valid, "export function double(value: number) { return value * 2; }\n");

  const pass = spawnSync(executable, ["-c", config, "--no-ignore", valid], { encoding: "utf8" });

  assert.equal(pass.status, 0, pass.stdout + pass.stderr);

  const invalid = join(directory, "invalid.ts");

  writeFileSync(invalid, "export const value = 1 as unknown as string;\n");

  const fail = spawnSync(executable, ["-c", config, "--no-ignore", invalid], { encoding: "utf8" });

  assert.notEqual(fail.status, 0, "Expected the anti-slop fixture to fail");
  assert.match(fail.stdout + fail.stderr, /no-chained-type-assertions/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
