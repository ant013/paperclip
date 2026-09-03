# Required Codex instructions file

Status: Approved as the Paperclip prerequisite of the Glitcherry shared
execution-workspace specification

Date: 2026-09-03  
Baseline: `61eb952e946957b458d26596bfd5aace2fe4db30` (`origin/master`)  
Branch: `feature/required-codex-instructions`

## Goal

Allow a `codex_local` agent to require its configured role-instruction file.
Today an unreadable `instructionsFilePath` logs a warning and starts Codex without
the role instructions. Glitcherry needs a narrow opt-in fail-closed mode because
all roles will share one code workspace while retaining independent instruction
files.

## Assumptions

- Existing agents keep the current warning-and-continue behavior unless they opt
  in.
- This change does not alter repository-scoped `AGENTS.md` discovery.
- Glitcherry will set the new option through its rendered agent configuration.

## Scope

- Add optional boolean adapter config `requireInstructionsFile`.
- When true, reject an empty, missing, unreadable, or non-file
  `instructionsFilePath` before spawning Codex.
- When false or absent, preserve the current behavior exactly.
- Document the option and add focused execution tests.

## Affected files

- `packages/adapters/codex-local/src/index.ts`
- `packages/adapters/codex-local/src/server/execute.ts`
- `server/src/__tests__/codex-local-execute.test.ts`

UI form work is intentionally excluded. Glitcherry supplies the option in its
rendered adapter JSON, and the adapter already accepts configuration fields not
created by the generic form.

## Acceptance criteria

1. `requireInstructionsFile=true` plus a readable regular file prepends the file
   and runs normally.
2. Strict mode with an empty path, missing path, directory, or read failure throws
   a clear adapter error before `runAdapterExecutionTargetProcess` is called.
3. Absent/false strict mode retains the current warning-and-continue behavior.
4. No file contents or secrets appear in the error.

## Verification

- Focused `codex-local-execute` Vitest cases for strict success, strict failures,
  and legacy compatibility.
- Adapter typecheck.
- Repository `git diff --check`.

## Open questions

None. The option name, compatibility behavior, and failure boundary are fixed by
the approved Glitcherry specification.
