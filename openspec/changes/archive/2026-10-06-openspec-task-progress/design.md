## Context

Ralph stops early only when the agent emits `completion_promise`. A required completion gate can also demand output files, a clean `OPEN_QUESTIONS.md`, and fresh `acceptance: true` commands. Separately, each iteration is labeled with durable progress by hashing files under the task directory. That snapshot excludes `RALPH.md` and `RALPH_PROGRESS.md`, ignores the repo cwd, and does not stop the loop. `no-progress-exhaustion` is only the final label when no iteration had `progress: true`.

OpenSpec apply success is a checkbox ledger. `openspec instructions apply --change <id> --json` reports `state`, `progress.{total,complete,remaining}`, and tasks whose ids are the nth checkbox. The tasks file normally lives in the repo cwd, not the task folder. Loops that do not set an OpenSpec binding must keep today's behavior.

## Goals / Non-Goals

**Goals:**

- Bind a loop to one OpenSpec change from `RALPH.md`.
- Use newly checked tasks as the iteration progress signal when that binding is set.
- Warn and continue when an iteration checks off nothing.
- Name the checked-off tasks in the iteration record, transcript, final summary, and HTML report.
- Stop on the promise only when the ledger has tasks and none remain, even if `completion_gate` is `disabled`.
- Tell the agent to attempt more than one remaining task. Do not enforce a minimum.

**Non-Goals:**

- Archiving the change or merging specs.
- A new terminal status, a new npm dependency, or a bundled preset.
- Draft or scaffold detection of OpenSpec changes.
- Replacing `acceptance: true` as the correctness check.
- Changing progress or completion for loops that do not set the binding.
- A hard quota of tasks per iteration.

## Decisions

### 1. Frontmatter binding

Add `openspec_change` and optional `openspec_tasks`, with camelCase aliases `openspecChange` and `openspecTasks`.

- `openspec_change` is a single path token: `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- `openspec_tasks` is a cwd-relative file path, confined with the same realpath rules as required outputs, rooted at the repo cwd rather than the task directory.
- Setting either key requires `completion_promise`.
- Setting `openspec_tasks` without `openspec_change` is valid. The tasks file is the ledger and the change name is omitted from records.
- Setting both uses the tasks file for the ledger and keeps the change name for display. The CLI is not required in that case.
- An invalid value is an invalid `RALPH.md`, same as other frontmatter errors, and stops the runner on that iteration.

Alternative considered: infer the change when only one active change exists. Rejected. The child has no operator prompt, and auto-pick would hide which ledger the gate uses.

### 2. Resolve the ledger without a package dependency

Do not depend on `@fission-ai/openspec`.

- When only `openspec_change` is set, resolve with `execFile("openspec", ["instructions", "apply", "--change", id, "--json"])` in the repo cwd. Never interpolate the id into `bash -c`.
- Parse `progress` and `tasks`. Ignore `instruction` text as control flow.
- When `openspec_tasks` is set, read that file and parse checkboxes with OpenSpec's rule: `/^[-*]\s*\[([ xX])\]\s*(.+)\s*$/`. Do not use the more liberal `OPEN_QUESTIONS.md` parser.
- Task identity across iterations is the trimmed description. OpenSpec ids are positional and shift when lines are inserted.
- Bound ledger text copied into the prompt. Keep the same order of magnitude as existing command-output caps. Show counts plus the remaining descriptions, not the whole file.

Alternative considered: shell out through `commands` and `acceptance: true`. Rejected. Pre-iteration commands cannot see this iteration's checkoff, acceptance only checks the exit code, and `acceptance: true` forces a required gate and `OPEN_QUESTIONS.md`.

### 3. Checkbox delta owns the progress flag

When the binding is set, the iteration progress flag comes from the ledger diff, not the task-directory snapshot.

Compare a before snapshot, taken after commands and before the agent, with an after snapshot taken when the iteration finishes.

- `checkedOff`: descriptions that were unchecked before and checked after.
- `progress: true` when `checkedOff` is non-empty, or when `after.complete > before.complete`.
- `progress: false` when the ledger was readable and no task was newly checked. Emit a warning notification. Do not set the iteration status to error. Do not block the completion gate. Continue.
- If the count rose but no description matched, still set `progress: true` and add a soft warning that the checked line was reworded.
- If a box was unchecked and nothing was newly checked, `progress: false` and warn.
- If the ledger cannot be read, `progress: "unknown"` and warn. Do not invent checkoffs. Unknown does not increment the no-progress streak, matching the snapshot rule.
- Still capture `changedFiles` from the task-directory snapshot for evidence. Those file changes must not set `progress: true` and must not suppress the warning.

Alternative considered: OR the snapshot with the checkbox delta. Rejected. A code edit with no checked task would hide the warning and would not say what the session finished.

### 4. Completion evidence is independent of `completion_gate`

On a matched promise, resolve the ledger again.

- Ready only when `total > 0` and `remaining === 0`.
- Otherwise continue, and inject the blocking reason on the next iteration the same way a gate rejection is injected.
- Run this check when `completion_gate` is `required`, `optional`, or `disabled`. Disabled still skips required outputs, `OPEN_QUESTIONS.md`, and acceptance reruns.
- Do not stop just because the CLI reports `state: "all_done"`. The promise remains the audit claim.
- A missing CLI, non-zero exit, unexpected JSON, missing tasks file, empty ledger, or `state: "blocked"` is not ready. Fail closed.
- Do not run `openspec archive`.

Alternative considered: fold the check into `validateCompletionReadiness` and require `completion_gate: required`. Rejected. That forces `OPEN_QUESTIONS.md` onto every OpenSpec loop. Optional mode also does not block the stop today, so folding the check in would not actually enforce it.

### 5. Attempt more than one task in the prompt only

Inject an `[openspec]` block from `renderIterationPrompt`, beside `[pacing]` and `[completion gate]`.

- Show the change name when present, `complete/total`, and the bounded remaining list.
- Tell the agent to attempt more than one remaining task, not to stop after the first checkbox, to mark each finished task `- [x]` in the tasks file, and not to archive.
- If the previous iteration warned, include that warning.
- Do not add a minimum-completed gate. One checked task is meaningful progress. Zero is the warning case.
- `items_per_iteration` stays an optional ceiling. This change does not default it to 1.

### 6. Name the session result on the existing records

Add an optional `openspec` object to the iteration record:

- `change`, when configured
- `tasksPath`, when resolved
- `before` and `after` counts: `total`, `complete`, `remaining`
- `checkedOff`: description strings
- `warning`, when present

Surface that object in `iterations.jsonl`, the transcript header, the recent-iteration line in `final-summary.md`, and the HTML iteration card. Reuse the completion-gate event for the promise-time ledger check, with the OpenSpec reason in `reasons`. Do not add a terminal status.

## Risks / Trade-offs

- [Agent checks every box without doing the work] → The ledger is a progress and completion record, not proof of correctness. `acceptance: true` remains available when the operator also wants a required gate.
- [CLI missing or schema drift] → Fail closed at promise time. An unreadable ledger mid-iteration is `progress: "unknown"` plus a warning, not a false completion.
- [Reworded checkbox hides the name] → A rising complete count still counts as progress, with a soft warning. The counts remain in the record.
- [Duplicate descriptions collapse] → Matching is by description because positional ids are unstable. Duplicate lines can under-count named checkoffs; the count delta still records that something was checked.
- [Task text in the prompt] → Descriptions are untrusted file content. Inject a bounded list only, as command output already is.
- [Guardrail allowlists] → The built-in resolver uses `execFile` argv, so it is not subject to `shell_policy` bash matching. A missing binary still fails closed.

## Migration Plan

No data migration. Existing `RALPH.md` files that omit the new keys parse and run as they do today. Rollback is reverting the runner and parser changes. In-flight loops that already wrote iteration records without an `openspec` field remain readable because the field is optional.

## Open Questions

None. The gate stays independent of `completion_gate`, and file edits do not count as OpenSpec progress.
