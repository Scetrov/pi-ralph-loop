## 1. Frontmatter binding

- [x] 1.1 Parse `openspec_change` and `openspec_tasks`, including camelCase aliases, in `src/ralph.ts`
- [x] 1.2 Reject an unsafe change token, an escaping tasks path, and either key without `completion_promise`
- [x] 1.3 Add parser tests for valid bindings, aliases, missing promise, and path escape

## 2. Ledger resolution

- [x] 2.1 Resolve a change-name binding with `execFile` argv `openspec instructions apply --change <id> --json` in the repo cwd
- [x] 2.2 Parse an `openspec_tasks` file with the OpenSpec checkbox rule and confine the path to the repo cwd
- [x] 2.3 Treat a missing CLI, bad JSON, missing file, or empty checkbox list as an unresolved ledger
- [x] 2.4 Add tests that a change id is never passed through a shell string

## 3. Iteration progress

- [x] 3.1 Snapshot the ledger before the agent runs and diff it after the iteration
- [x] 3.2 Set `progress` from newly checked descriptions or a rising complete count, not from task-directory file changes
- [x] 3.3 Warn and continue when no task is checked off, and use `progress: "unknown"` when the ledger cannot be read
- [x] 3.4 Warn softly when the complete count rises but the checked description does not match a previous unchecked task
- [x] 3.5 Inject a bounded `[openspec]` prompt block that asks for more than one remaining task and forbids archive
- [x] 3.6 Add runner tests for one checkoff, several checkoffs, zero checkoffs, reworded checkoffs, and code-only edits

## 4. Completion evidence

- [x] 4.1 After a matched promise, continue unless the ledger has `total > 0` and `remaining === 0`
- [x] 4.2 Enforce that ledger check when `completion_gate` is `disabled`, without reviving required outputs, `OPEN_QUESTIONS.md`, or acceptance reruns
- [x] 4.3 Feed the unsatisfied ledger reason into the next iteration prompt
- [x] 4.4 Add runner tests for promise-plus-finished-ledger stop, promise with remaining tasks, and disabled-gate continuation

## 5. Session records

- [x] 5.1 Store before and after counts, `checkedOff` descriptions, and any warning on the iteration record
- [x] 5.2 Show that record in the transcript header, `final-summary.md`, and the HTML iteration card
- [x] 5.3 Add summary and report tests that name the checked-off tasks

## 6. Documentation

- [x] 6.1 Document the keys, the warning behavior, and the promise-plus-ledger stop in the README and skill cookbook
- [x] 6.2 State that existing loops without the binding are unchanged and that Ralph does not archive the change
