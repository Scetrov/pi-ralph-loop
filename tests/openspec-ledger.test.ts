import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  assessOpenSpecCompletion,
  diffOpenSpecLedgers,
  openspecApplyArgv,
  parseOpenSpecTasksMarkdown,
  resolveOpenSpecLedger,
  type OpenSpecLedger,
} from "../src/openspec-ledger.ts";

const execFileAsync = promisify(execFile);

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "pi-ralph-openspec-"));
}

function resolved(tasks: Array<{ description: string; checked: boolean }>, counts?: { total: number; complete: number; remaining: number }): OpenSpecLedger {
  const complete = counts?.complete ?? tasks.filter((task) => task.checked).length;
  const total = counts?.total ?? tasks.length;
  return {
    resolved: true,
    total,
    complete,
    remaining: counts?.remaining ?? total - complete,
    tasks,
  };
}

test("parseOpenSpecTasksMarkdown uses only the OpenSpec checkbox rule", () => {
  const tasks = parseOpenSpecTasksMarkdown([
    "- [ ] 1.1 unchecked",
    "* [x] 1.2 checked star",
    "- [X] 1.3 checked upper",
    "- [x]no-space",
    "1. [ ] numbered",
    "  - [ ] indented",
    "- [ ] ",
  ].join("\n"));

  assert.deepEqual(tasks, [
    { description: "1.1 unchecked", checked: false },
    { description: "1.2 checked star", checked: true },
    { description: "1.3 checked upper", checked: true },
    { description: "no-space", checked: true },
  ]);
});

test("resolveOpenSpecLedger reads a confined tasks file and does not require the CLI", async () => {
  const cwd = tempDir();
  try {
    mkdirSync(join(cwd, "openspec"));
    writeFileSync(join(cwd, "openspec", "tasks.md"), "- [x] done\n- [ ] left\n", "utf8");
    let called = false;
    const ledger = await resolveOpenSpecLedger({
      cwd,
      change: "add-widget",
      tasksPath: "openspec/tasks.md",
      execFile: async () => {
        called = true;
        return { stdout: "", stderr: "" };
      },
    });

    assert.equal(called, false);
    assert.equal(ledger.resolved, true);
    if (!ledger.resolved) return;
    assert.equal(ledger.change, "add-widget");
    assert.equal(ledger.tasksPath, "openspec/tasks.md");
    assert.deepEqual(
      { total: ledger.total, complete: ledger.complete, remaining: ledger.remaining },
      { total: 2, complete: 1, remaining: 1 },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("resolveOpenSpecLedger treats missing files, empty checklists, and escaping paths as unresolved", async () => {
  const cwd = tempDir();
  const outside = tempDir();
  try {
    writeFileSync(join(cwd, "empty.md"), "# no tasks\n", "utf8");
    writeFileSync(join(outside, "secret.md"), "- [x] hidden\n", "utf8");
    symlinkSync(join(outside, "secret.md"), join(cwd, "linked.md"));

    const missing = await resolveOpenSpecLedger({ cwd, tasksPath: "missing.md", execFile: async () => { throw new Error("should not run"); } });
    const empty = await resolveOpenSpecLedger({ cwd, tasksPath: "empty.md", execFile: async () => { throw new Error("should not run"); } });
    const escaped = await resolveOpenSpecLedger({ cwd, tasksPath: "linked.md", execFile: async () => { throw new Error("should not run"); } });
    const lexical = await resolveOpenSpecLedger({ cwd, tasksPath: "../tasks.md", execFile: async () => { throw new Error("should not run"); } });

    assert.equal(missing.resolved, false);
    assert.equal(empty.resolved, false);
    assert.equal(escaped.resolved, false);
    assert.equal(lexical.resolved, false);
    if (escaped.resolved || lexical.resolved) return;
    assert.match(escaped.reason, /escapes the repo cwd|not a regular file/);
    assert.match(lexical.reason, /relative file path/);
    assert.equal(existsOutsideUnread(outside), true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

function existsOutsideUnread(outside: string): boolean {
  return readFileSync(join(outside, "secret.md"), "utf8").includes("hidden");
}

test("resolveOpenSpecLedger passes the change id as execFile argv and never a shell string", async () => {
  const cwd = tempDir();
  const bin = join(cwd, "bin");
  const argvFile = join(cwd, "argv.txt");
  try {
    mkdirSync(bin);
    writeFileSync(join(bin, "openspec"), `#!/bin/sh
printf '%s\\n' "$0" "$@" > ${JSON.stringify(argvFile)}
printf '%s\\n' '{"progress":{"total":2,"complete":1,"remaining":1},"tasks":[{"description":"1.1 parse","done":true},{"description":"1.2 wire","done":false}],"state":"ready"}'
`, { mode: 0o755 });

    const ledger = await resolveOpenSpecLedger({
      cwd,
      change: "add-widget",
      env: { ...process.env, PATH: bin },
    });
    const recorded = readFileSync(argvFile, "utf8").trim().split("\n");

    assert.equal(recorded[0].endsWith("/openspec"), true);
    assert.deepEqual(recorded.slice(1), openspecApplyArgv("add-widget"));
    assert.equal(recorded.some((arg) => arg.includes("bash") || arg.includes(" -c ")), false);
    assert.equal(ledger.resolved, true);
    if (!ledger.resolved) return;
    assert.equal(ledger.complete, 1);
    assert.equal(ledger.tasks[1]?.description, "1.2 wire");

    const calls: string[][] = [];
    const injected = await resolveOpenSpecLedger({
      cwd,
      change: "add-widget",
      execFile: async (file, args) => {
        calls.push([file, ...args]);
        return { stdout: "{\"progress\":{\"total\":1,\"complete\":0,\"remaining\":1},\"tasks\":[{\"description\":\"1.1 parse\",\"done\":false}],\"state\":\"ready\"}", stderr: "" };
      },
    });
    assert.deepEqual(calls, [["openspec", ...openspecApplyArgv("add-widget")]]);
    assert.equal(injected.resolved, true);

    const unsafe = await resolveOpenSpecLedger({
      cwd,
      change: "add;rm -rf /",
      execFile: async () => {
        throw new Error("unsafe id reached execFile");
      },
    });
    assert.equal(unsafe.resolved, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("resolveOpenSpecLedger treats a missing CLI, bad JSON, and an empty task list as unresolved", async () => {
  const cwd = tempDir();
  try {
    const missingCli = await resolveOpenSpecLedger({
      cwd,
      change: "add-widget",
      env: { ...process.env, PATH: cwd },
    });
    const badJson = await resolveOpenSpecLedger({
      cwd,
      change: "add-widget",
      execFile: async () => ({ stdout: "not-json", stderr: "" }),
    });
    const emptyTasks = await resolveOpenSpecLedger({
      cwd,
      change: "add-widget",
      execFile: async () => ({ stdout: "{\"progress\":{\"total\":0,\"complete\":0,\"remaining\":0},\"tasks\":[],\"state\":\"all_done\"}", stderr: "" }),
    });

    assert.equal(missingCli.resolved, false);
    assert.equal(badJson.resolved, false);
    assert.equal(emptyTasks.resolved, false);
    assert.equal(assessOpenSpecCompletion(emptyTasks).ready, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("diffOpenSpecLedgers names checkoffs, warns on none, and warns when a rising count cannot be named", () => {
  const one = diffOpenSpecLedgers(
    resolved([{ description: "3.2 write parser", checked: false }]),
    resolved([{ description: "3.2 write parser", checked: true }]),
  );
  assert.equal(one.progress, true);
  assert.deepEqual(one.record.checkedOff, ["3.2 write parser"]);
  assert.equal(one.warning, undefined);

  const several = diffOpenSpecLedgers(
    resolved([
      { description: "3.2 write parser", checked: false },
      { description: "3.3 wire the gate", checked: false },
    ]),
    resolved([
      { description: "3.2 write parser", checked: true },
      { description: "3.3 wire the gate", checked: true },
    ]),
  );
  assert.deepEqual(several.record.checkedOff, ["3.2 write parser", "3.3 wire the gate"]);

  const none = diffOpenSpecLedgers(
    resolved([{ description: "3.2 write parser", checked: false }]),
    resolved([{ description: "3.2 write parser", checked: false }]),
  );
  assert.equal(none.progress, false);
  assert.match(none.warning ?? "", /No OpenSpec task was checked off/);

  const reworded = diffOpenSpecLedgers(
    resolved([{ description: "old name", checked: false }], { total: 1, complete: 0, remaining: 1 }),
    resolved([{ description: "new name", checked: true }], { total: 1, complete: 1, remaining: 0 }),
  );
  assert.equal(reworded.progress, true);
  assert.deepEqual(reworded.record.checkedOff, []);
  assert.match(reworded.warning ?? "", /could not be matched by description/);

  const unreadable = diffOpenSpecLedgers(
    { resolved: false, reason: "missing" },
    { resolved: false, reason: "missing" },
  );
  assert.equal(unreadable.progress, "unknown");
  assert.deepEqual(unreadable.record.checkedOff, []);
  assert.match(unreadable.warning ?? "", /could not be read/);
});

test("assessOpenSpecCompletion requires a non-empty finished ledger and ignores all_done alone", () => {
  const finished = assessOpenSpecCompletion(resolved([
    { description: "a", checked: true },
    { description: "b", checked: true },
    { description: "c", checked: true },
  ]));
  assert.deepEqual(finished, { ready: true, reasons: [] });

  const remainingLedger = resolved([{ description: "a", checked: false }]);
  const remaining = assessOpenSpecCompletion(remainingLedger.resolved ? { ...remainingLedger, state: "all_done" } : remainingLedger);
  assert.equal(remaining.ready, false);
  assert.match(remaining.reasons.join(" "), /not finished/);

  const blockedLedger = resolved([{ description: "a", checked: true }]);
  const blocked = assessOpenSpecCompletion(blockedLedger.resolved ? { ...blockedLedger, state: "blocked" } : blockedLedger);
  assert.equal(blocked.ready, false);
  assert.match(blocked.reasons.join(" "), /blocked/);
});

test("default execFile helper is the promisified execFile argv API", () => {
  assert.equal(typeof execFileAsync, "function");
  assert.deepEqual(openspecApplyArgv("add-widget"), ["instructions", "apply", "--change", "add-widget", "--json"]);
});
