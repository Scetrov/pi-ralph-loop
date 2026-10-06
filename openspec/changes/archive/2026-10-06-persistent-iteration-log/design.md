## Context

The runner emits iteration start and outcome messages through the extension notification callback. Pi's informational notification renderer reuses the previous informational entry, so consecutive informational records are not independently retained. Warning and error notifications are retained and are appropriate for exceptional conditions.

## Goals / Non-Goals

- Goals: retain every iteration start and outcome in display order; preserve warning/error notifications; avoid changing loop execution.
- Non-Goals: changing Pi's notification renderer, changing iteration numbering, or adding a new UI dependency.

## Decisions

- Use `pi.sendMessage()` with custom type `ralph-iteration-ui` to snapshot informational lifecycle records. `display: false` prevents a second copy in Pi's default transcript, while the registered renderer supplies the durable visible copy.
- Register a renderer that returns plain text wrapped to the available width. The renderer is theme-neutral and has no additional package dependency.
- Route warning and error notifications through the existing `ctx.ui.notify()` path so exceptional feedback remains visually distinct.
- If persistent delivery is unavailable, retain the existing informational notification as a compatibility fallback.

## Risks / Trade-offs

- [Custom entries may be unavailable in a noninteractive runtime] → Fall back to the existing notification path.
- [Transcript entries consume session history] → Keep each record compact and suppress its default transcript copy so only the registered renderer displays it.

## Migration Plan

No stored-data migration is required. Existing runs continue, and new informational lifecycle records appear as persistent entries.

## Open Questions

None.
