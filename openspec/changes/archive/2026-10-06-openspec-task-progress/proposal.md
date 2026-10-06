## Why

Ralph can already stop on a completion promise, but it cannot tell whether an OpenSpec change advanced. Task-directory file changes are the wrong signal: the tasks file usually lives in the repo, an empty iteration should warn rather than fail, and a session record that only says `progress=true` does not say which tasks were checked off.

## What Changes

- Add optional `RALPH.md` keys `openspec_change` and `openspec_tasks` so a loop can bind to one OpenSpec change ledger.
- Treat newly checked OpenSpec tasks as the iteration progress signal when that binding is set. Zero newly checked tasks warns and continues. It does not fail the iteration or block the completion gate.
- Record the tasks checked off in each iteration, with before and after counts, so status, transcripts, and the final summary can name what the session finished.
- Stop early only when the agent emits the completion promise and the ledger has at least one task with none remaining. Do not stop on `all_done` alone, and do not archive the change.
- Ask the agent to attempt more than one remaining task per iteration. That is prompt guidance, not a quota.

## Capabilities

### New Capabilities

- `openspec-task-ledger`: Bind a loop to an OpenSpec change, resolve its task ledger, and use a fully checked ledger as completion evidence alongside the existing promise.
- `openspec-iteration-progress`: Measure each iteration by tasks checked off, warn when none were checked, and record the named result.

### Modified Capabilities

- None. There are no existing specs, and loops that do not set `openspec_change` keep their current progress and completion behavior.

## Impact

- `RALPH.md` frontmatter parsing and validation in `src/ralph.ts`.
- Iteration prompt, progress assessment, and completion checks in `src/runner.ts`.
- Iteration records, events, final summary, and the HTML report.
- Tests in `tests/ralph.test.ts` and `tests/runner.test.ts`, plus README and skill cookbook documentation.
- No new package dependency. Ledger resolution uses the `openspec` CLI when a change name is configured, or a cwd-relative tasks file when `openspec_tasks` is set.
