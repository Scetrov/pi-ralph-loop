# openspec-task-ledger Specification

## Purpose

Bind a Ralph loop to one OpenSpec change ledger and use a fully checked ledger as completion evidence alongside the existing completion promise.

## Requirements

### Requirement: OpenSpec binding is explicit
The parser SHALL accept optional `openspec_change` and `openspec_tasks` frontmatter keys, including the camelCase aliases `openspecChange` and `openspecTasks`. `openspec_change` MUST be a single path token matching `^[A-Za-z0-9][A-Za-z0-9._-]*$`. `openspec_tasks` MUST be a relative file path under the repo cwd and MUST be rejected when it escapes that cwd, including through a symlink. Setting either key without `completion_promise` MUST be an invalid frontmatter error. Loops that set neither key MUST keep their existing completion behavior.

#### Scenario: Valid change name
- **WHEN** `RALPH.md` sets `openspec_change` to `add-widget` and sets `completion_promise`
- **THEN** the frontmatter is valid and the loop binds to that change name

#### Scenario: Missing completion promise
- **WHEN** `RALPH.md` sets `openspec_change` or `openspec_tasks` and omits `completion_promise`
- **THEN** validation fails and the runner does not start that iteration

#### Scenario: Path escape
- **WHEN** `openspec_tasks` is an absolute path, contains `..`, or resolves outside the repo cwd
- **THEN** validation or resolution fails closed and the path is not read

### Requirement: Ledger resolution does not add a package dependency
When only `openspec_change` is set, the runner SHALL resolve the ledger by executing `openspec` with argument array `instructions`, `apply`, `--change`, the change id, and `--json` in the repo cwd. The change id MUST NOT be interpolated into a shell string. When `openspec_tasks` is set, the runner SHALL read that file instead of requiring the CLI and SHALL count only lines matching `/^[-*]\s*\[([ xX])\]\s*(.+)\s*$/`. A missing CLI, non-zero exit, unusable JSON, missing file, or empty checkbox list MUST NOT be treated as a completed ledger.

#### Scenario: CLI JSON ledger
- **WHEN** only `openspec_change` is set and `openspec instructions apply --json` returns progress counts and tasks
- **THEN** the runner uses those counts and task descriptions as the ledger

#### Scenario: Explicit tasks file
- **WHEN** `openspec_tasks` points at a cwd-relative markdown file
- **THEN** the runner parses that file's checkboxes and does not require the `openspec` binary

#### Scenario: CLI unavailable at completion
- **WHEN** the agent emits the completion promise and the ledger cannot be resolved
- **THEN** completion is not ready and the loop continues

### Requirement: Promise plus an empty remaining count is the stop evidence
When an OpenSpec binding is set, a matched completion promise SHALL stop the loop only if the resolved ledger has `total > 0` and `remaining === 0`. The runner MUST perform this check when `completion_gate` is `required`, `optional`, or `disabled`. A disabled gate MUST still skip required outputs, `OPEN_QUESTIONS.md`, and acceptance reruns. The runner MUST NOT stop solely because the CLI reports `state` `all_done`, and MUST NOT archive the change.

#### Scenario: Ledger finished and promise emitted
- **WHEN** the agent emits the configured completion promise and the ledger has three tasks with zero remaining
- **THEN** the loop stops with status `complete`

#### Scenario: Promise while tasks remain
- **WHEN** the agent emits the completion promise and the ledger still has remaining tasks
- **THEN** the loop continues and the next iteration is told which ledger condition is unsatisfied

#### Scenario: Disabled gate does not skip the ledger
- **WHEN** `completion_gate` is `disabled`, the promise is emitted, and at least one task remains
- **THEN** the loop continues even though required outputs and `OPEN_QUESTIONS.md` are not checked

#### Scenario: All tasks already done without a promise
- **WHEN** the ledger has zero remaining tasks and the agent does not emit the completion promise
- **THEN** the loop does not stop early because of the ledger
