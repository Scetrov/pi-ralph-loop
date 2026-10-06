import { execFile as execFileCallback } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { validateRelativeRepoFilePath } from "./ralph.ts";

const execFileAsync = promisify(execFileCallback);

export const OPENSPEC_CHANGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const OPENSPEC_TASK_LINE = /^[-*]\s*\[([ xX])\]\s*(.+)\s*$/;
export const OPENSPEC_PROMPT_MAX_REMAINING = 40;
export const OPENSPEC_PROMPT_MAX_CHARS = 4_000;

const LEDGER_REASON_MAX_CHARS = 200;
const CLI_TIMEOUT_MS = 15_000;
const CLI_MAX_BUFFER = 1_000_000;

export type OpenSpecTask = {
  description: string;
  checked: boolean;
};

export type OpenSpecCounts = {
  total: number;
  complete: number;
  remaining: number;
};

export type OpenSpecLedger =
  | {
      resolved: true;
      change?: string;
      tasksPath?: string;
      total: number;
      complete: number;
      remaining: number;
      tasks: OpenSpecTask[];
      state?: string;
    }
  | {
      resolved: false;
      change?: string;
      tasksPath?: string;
      reason: string;
    };

export type OpenSpecIterationRecord = {
  change?: string;
  tasksPath?: string;
  before?: OpenSpecCounts;
  after?: OpenSpecCounts;
  checkedOff: string[];
  warning?: string;
};

export type OpenSpecProgressDiff = {
  progress: boolean | "unknown";
  warning?: string;
  record: OpenSpecIterationRecord;
};

export type OpenSpecExecFile = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number },
) => Promise<{ stdout: string; stderr: string }>;

export type OpenSpecTasksPathInspection =
  | { kind: "ok"; absolutePath: string }
  | { kind: "missing"; reason: string }
  | { kind: "rejected"; reason: string };

export function openspecApplyArgv(changeId: string): string[] {
  return ["instructions", "apply", "--change", changeId, "--json"];
}

export function parseOpenSpecTasksMarkdown(raw: string): OpenSpecTask[] {
  const tasks: OpenSpecTask[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = OPENSPEC_TASK_LINE.exec(line);
    if (!match) continue;
    const description = match[2].trim();
    if (!description) continue;
    tasks.push({
      description,
      checked: match[1] !== " ",
    });
  }
  return tasks;
}

export function inspectOpenSpecTasksPath(cwd: string, tasksPath: string): OpenSpecTasksPathInspection {
  const lexicalError = validateRelativeRepoFilePath(tasksPath);
  if (lexicalError) {
    return { kind: "rejected", reason: `Invalid openspec_tasks: ${tasksPath} must be a relative file path under the repo cwd` };
  }

  const absolutePath = join(cwd, tasksPath);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(absolutePath);
  } catch {
    return { kind: "missing", reason: `OpenSpec tasks file not found: ${tasksPath}` };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { kind: "rejected", reason: `Invalid openspec_tasks: ${tasksPath} escapes the repo cwd or is not a regular file` };
  }

  try {
    const realCwd = realpathSync(cwd);
    const realFile = realpathSync(absolutePath);
    const relativePath = relative(realCwd, realFile);
    if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return { kind: "rejected", reason: `Invalid openspec_tasks: ${tasksPath} escapes the repo cwd` };
    }
  } catch {
    return { kind: "rejected", reason: `Invalid openspec_tasks: ${tasksPath} escapes the repo cwd` };
  }

  return { kind: "ok", absolutePath };
}

function countsOf(ledger: OpenSpecLedger): OpenSpecCounts | undefined {
  if (!ledger.resolved) return undefined;
  return { total: ledger.total, complete: ledger.complete, remaining: ledger.remaining };
}

function boundedReason(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= LEDGER_REASON_MAX_CHARS) return compact;
  return `${compact.slice(0, LEDGER_REASON_MAX_CHARS)}…`;
}

function unresolved(reason: string, change?: string, tasksPath?: string): OpenSpecLedger {
  return {
    resolved: false,
    ...(change ? { change } : {}),
    ...(tasksPath ? { tasksPath } : {}),
    reason: boundedReason(reason),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseOpenSpecCliJson(stdout: string, change?: string): OpenSpecLedger {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return unresolved("OpenSpec CLI returned invalid JSON", change);
  }
  if (!isRecord(parsed) || !isRecord(parsed.progress) || !Array.isArray(parsed.tasks)) {
    return unresolved("OpenSpec CLI returned unexpected JSON", change);
  }

  const { total, complete, remaining } = parsed.progress;
  if (!isCount(total) || !isCount(complete) || !isCount(remaining)) {
    return unresolved("OpenSpec CLI returned unexpected JSON", change);
  }

  const tasks: OpenSpecTask[] = [];
  for (const task of parsed.tasks) {
    if (!isRecord(task) || typeof task.description !== "string" || typeof task.done !== "boolean") {
      return unresolved("OpenSpec CLI returned unexpected JSON", change);
    }
    const description = task.description.trim();
    if (!description) return unresolved("OpenSpec CLI returned unexpected JSON", change);
    tasks.push({ description, checked: task.done });
  }

  if (tasks.length === 0) {
    return unresolved("OpenSpec ledger has no tasks", change);
  }

  return {
    resolved: true,
    ...(change ? { change } : {}),
    total,
    complete,
    remaining,
    tasks,
    ...(typeof parsed.state === "string" ? { state: parsed.state } : {}),
  };
}

function ledgerFromTasks(tasks: OpenSpecTask[], change?: string, tasksPath?: string): OpenSpecLedger {
  if (tasks.length === 0) {
    return unresolved("OpenSpec ledger has no tasks", change, tasksPath);
  }
  const complete = tasks.filter((task) => task.checked).length;
  return {
    resolved: true,
    ...(change ? { change } : {}),
    ...(tasksPath ? { tasksPath } : {}),
    total: tasks.length,
    complete,
    remaining: tasks.length - complete,
    tasks,
  };
}

async function defaultExecFile(
  file: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(file, [...args], {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout ?? CLI_TIMEOUT_MS,
    maxBuffer: CLI_MAX_BUFFER,
    windowsHide: true,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

export async function resolveOpenSpecLedger(input: {
  cwd: string;
  change?: string;
  tasksPath?: string;
  execFile?: OpenSpecExecFile;
  env?: NodeJS.ProcessEnv;
}): Promise<OpenSpecLedger> {
  const change = input.change?.trim() || undefined;
  const tasksPath = input.tasksPath?.trim() || undefined;
  if (change && !OPENSPEC_CHANGE_PATTERN.test(change)) {
    return unresolved("Invalid openspec_change token", change, tasksPath);
  }
  if (!change && !tasksPath) {
    return unresolved("OpenSpec binding is missing");
  }

  if (tasksPath) {
    const inspected = inspectOpenSpecTasksPath(input.cwd, tasksPath);
    if (inspected.kind !== "ok") {
      return unresolved(inspected.reason, change, tasksPath);
    }
    try {
      const raw = readFileSync(inspected.absolutePath, "utf8");
      return ledgerFromTasks(parseOpenSpecTasksMarkdown(raw), change, tasksPath);
    } catch {
      return unresolved(`OpenSpec tasks file not found: ${tasksPath}`, change, tasksPath);
    }
  }

  const exec = input.execFile ?? defaultExecFile;
  try {
    const { stdout } = await exec("openspec", openspecApplyArgv(change!), {
      cwd: input.cwd,
      env: input.env,
      timeout: CLI_TIMEOUT_MS,
    });
    return parseOpenSpecCliJson(stdout, change);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return unresolved(`OpenSpec CLI failed: ${message}`, change);
  }
}

export function diffOpenSpecLedgers(before: OpenSpecLedger, after: OpenSpecLedger): OpenSpecProgressDiff {
  const change = after.change ?? before.change;
  const tasksPath = after.tasksPath ?? before.tasksPath;
  const base = {
    ...(change ? { change } : {}),
    ...(tasksPath ? { tasksPath } : {}),
    checkedOff: [] as string[],
  };

  if (!before.resolved || !after.resolved) {
    const reason = [before, after]
      .filter((ledger) => !ledger.resolved)
      .map((ledger) => ledger.reason)
      .join("; ");
    const warning = `OpenSpec ledger could not be read: ${reason}`;
    return {
      progress: "unknown",
      warning,
      record: {
        ...base,
        ...(countsOf(before) ? { before: countsOf(before) } : {}),
        ...(countsOf(after) ? { after: countsOf(after) } : {}),
        warning,
      },
    };
  }

  const beforeUnchecked = new Map<string, number>();
  for (const task of before.tasks) {
    if (!task.checked) beforeUnchecked.set(task.description, (beforeUnchecked.get(task.description) ?? 0) + 1);
  }
  const used = new Map<string, number>();
  const checkedOff: string[] = [];
  for (const task of after.tasks) {
    if (!task.checked) continue;
    const available = beforeUnchecked.get(task.description) ?? 0;
    const consumed = used.get(task.description) ?? 0;
    if (consumed >= available) continue;
    used.set(task.description, consumed + 1);
    checkedOff.push(task.description);
  }

  const countRose = after.complete > before.complete;
  let warning: string | undefined;
  let progress: boolean | "unknown" = false;
  if (checkedOff.length > 0 || countRose) {
    progress = true;
    if (checkedOff.length === 0) {
      warning = "The checked task could not be matched by description";
    }
  } else {
    warning = "No OpenSpec task was checked off";
  }

  return {
    progress,
    ...(warning ? { warning } : {}),
    record: {
      ...base,
      before: countsOf(before),
      after: countsOf(after),
      checkedOff,
      ...(warning ? { warning } : {}),
    },
  };
}

export function assessOpenSpecCompletion(ledger: OpenSpecLedger): { ready: boolean; reasons: string[] } {
  if (!ledger.resolved) {
    return { ready: false, reasons: [`OpenSpec ledger could not be resolved: ${ledger.reason}`] };
  }
  if (ledger.state === "blocked") {
    return { ready: false, reasons: ["OpenSpec ledger is blocked"] };
  }
  if (ledger.total <= 0) {
    return { ready: false, reasons: ["OpenSpec ledger has no tasks"] };
  }
  if (ledger.remaining !== 0) {
    return { ready: false, reasons: [`OpenSpec ledger is not finished: ${ledger.remaining} remaining of ${ledger.total}`] };
  }
  return { ready: true, reasons: [] };
}

export function summarizeOpenSpecPrompt(ledger: OpenSpecLedger | undefined): {
  change?: string;
  tasksPath?: string;
  complete?: number;
  total?: number;
  remaining: string[];
  remainingTruncated: boolean;
  unresolvedReason?: string;
} {
  if (!ledger) {
    return { remaining: [], remainingTruncated: false, unresolvedReason: "OpenSpec ledger could not be read" };
  }
  if (!ledger.resolved) {
    return {
      ...(ledger.change ? { change: ledger.change } : {}),
      ...(ledger.tasksPath ? { tasksPath: ledger.tasksPath } : {}),
      remaining: [],
      remainingTruncated: false,
      unresolvedReason: ledger.reason,
    };
  }

  const remaining: string[] = [];
  let usedChars = 0;
  let truncated = false;
  for (const task of ledger.tasks) {
    if (task.checked) continue;
    if (remaining.length >= OPENSPEC_PROMPT_MAX_REMAINING || usedChars >= OPENSPEC_PROMPT_MAX_CHARS) {
      truncated = true;
      break;
    }
    const description = task.description.length > 200 ? `${task.description.slice(0, 200)}…` : task.description;
    if (usedChars + description.length > OPENSPEC_PROMPT_MAX_CHARS && remaining.length > 0) {
      truncated = true;
      break;
    }
    remaining.push(description);
    usedChars += description.length;
  }
  if (ledger.tasks.some((task) => !task.checked) && remaining.length < ledger.tasks.filter((task) => !task.checked).length) {
    truncated = true;
  }

  return {
    ...(ledger.change ? { change: ledger.change } : {}),
    ...(ledger.tasksPath ? { tasksPath: ledger.tasksPath } : {}),
    complete: ledger.complete,
    total: ledger.total,
    remaining,
    remainingTruncated: truncated,
  };
}
