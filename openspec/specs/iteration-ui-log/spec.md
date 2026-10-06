## Purpose

Keep iteration lifecycle records visible when informational notifications replace one another.

## Requirements

### Requirement: Iteration lifecycle records remain visible

The extension MUST present each informational iteration start and iteration outcome as a separate persistent session entry in emission order.

#### Scenario: Progress resets between no-progress iterations

- **WHEN** iteration 1 has no OpenSpec progress, iteration 2 has OpenSpec progress, and iteration 3 has no OpenSpec progress
- **THEN** persistent entries for iterations 1, 2, and 3 remain visible in that order
- **AND** warning notifications for iterations 1 and 3 remain separate from those persistent entries
