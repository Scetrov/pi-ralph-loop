# openspec-iteration-progress Specification

## Purpose

Measure each Ralph iteration by OpenSpec tasks checked off, warn when none were checked, and record the named result.

## Requirements

### Requirement: Checked-off tasks are the iteration progress signal
When an OpenSpec binding is set, the runner SHALL snapshot the ledger before the agent runs and again after the iteration. The runner MUST set `progress` to `true` when at least one description was unchecked before and checked after, or when the after complete count is greater than the before complete count. Task-directory file changes MUST still be recorded as changed files and MUST NOT set `progress` to `true` by themselves. Loops without an OpenSpec binding MUST keep the existing snapshot progress behavior.

#### Scenario: One task checked off
- **WHEN** the before ledger has an unchecked task `3.2 write parser` and the after ledger has that task checked
- **THEN** the iteration progress is `true` and the record names `3.2 write parser`

#### Scenario: Several tasks checked off
- **WHEN** two previously unchecked descriptions are checked during the iteration
- **THEN** the iteration progress is `true` and the record names both descriptions

#### Scenario: Code changed but no task checked
- **WHEN** the agent edits source files and the ledger complete count does not rise
- **THEN** the iteration progress is `false` and the changed files remain recorded as evidence

### Requirement: No checked task warns and continues
When the ledger is readable and the iteration checks off no task, the runner SHALL emit a warning, set `progress` to `false`, and continue the loop. This MUST NOT mark the iteration as an error and MUST NOT block the completion gate by itself. When the ledger cannot be read, the runner SHALL warn and set `progress` to `unknown` rather than invent a checkoff.

#### Scenario: Empty iteration
- **WHEN** the before and after ledgers have the same complete count and no description transitions to checked
- **THEN** the operator is warned that no OpenSpec task was checked off and the loop starts the next iteration

#### Scenario: Unreadable ledger
- **WHEN** the tasks file or CLI ledger cannot be read for the iteration
- **THEN** progress is `unknown`, a warning is recorded, and no task is reported as checked off

### Requirement: Reworded checkoffs still count
The runner SHALL treat the checkbox description as the cross-iteration identity. When the complete count rises but no before-unchecked description is checked after, the runner MUST still set `progress` to `true` and MUST record a warning that the checked task could not be named.

#### Scenario: Description rewritten while checked
- **WHEN** the complete count increases by one and the newly checked description was not an unchecked description in the before ledger
- **THEN** progress is `true` and the iteration warning says the checked task could not be matched by description

### Requirement: Iteration records name what finished
The iteration record SHALL include, when a binding is set and the ledger was compared, the before and after `total`, `complete`, and `remaining` counts, the `checkedOff` descriptions, and any warning. Transcripts, the final summary recent-iteration lines, and the HTML iteration card MUST show those names or counts so an operator can tell what that session finished without reading agent prose.

#### Scenario: Summary shows named tasks
- **WHEN** an iteration checks off `3.2 write parser` and `3.3 wire the gate`
- **THEN** the final summary and HTML report show both descriptions and the before and after counts

### Requirement: The prompt asks for more than one task
When a binding is set, the iteration prompt SHALL include an OpenSpec block that shows the current counts, a bounded list of remaining tasks, and an instruction to attempt more than one remaining task without stopping after the first checkbox. The block MUST tell the agent to mark finished tasks checked in the tasks file and MUST tell the agent not to archive the change. The runner MUST NOT fail or warn solely because the agent completed only one task. `items_per_iteration` MUST remain an optional ceiling and MUST NOT be forced to 1.

#### Scenario: Remaining work is shown
- **WHEN** an iteration starts with four of seven tasks complete
- **THEN** the prompt shows `4/7` and instructs the agent to attempt more than one remaining task

#### Scenario: One completion is still progress
- **WHEN** the agent checks off exactly one previously unchecked task
- **THEN** progress is `true` and no warning is emitted for completing too few tasks
