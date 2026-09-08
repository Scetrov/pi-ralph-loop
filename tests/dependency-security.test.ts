import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the dependency tree excludes deprecated Pi packages and extract-zip", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const path of Object.keys(lock.packages)) {
    assert.ok(!/node_modules\/@mariozechner\/pi-(ai|agent-core|coding-agent|tui)$/.test(path), path);
    assert.ok(!path.endsWith("node_modules/extract-zip"), path);
  }
  assert.ok(lock.packages["node_modules/@earendil-works/pi-coding-agent"]);
});
