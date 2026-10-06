## Why

Consecutive informational notifications can replace one another, so a successful iteration can disappear from the visible sequence. Iteration start and outcome records need durable presentation so operators can trust the displayed numbering.

## What Changes

- Render iteration start and outcome records as persistent custom session entries.
- Preserve warning and error notifications, including no-progress warnings.
- Keep iteration records visible across a no-progress, progress, no-progress sequence.
- Leave the iteration runner, numbering, and progress accounting unchanged.

## Capabilities

### New Capabilities

- `iteration-ui-log`: Persistent presentation of iteration lifecycle records in the operator session.

### Modified Capabilities

- None.

## Impact

- Affects the Ralph extension UI integration in `src/index.ts`.
- Adds regression coverage in `tests/index.test.ts`.
- No runner protocol, OpenSpec ledger, or completion-gate behavior changes.
