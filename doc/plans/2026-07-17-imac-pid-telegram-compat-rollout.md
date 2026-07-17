# iMac PID Validation + Telegram Compatibility Rollout

**Date:** 2026-07-17  
**Branch:** `fix/imac-pid-telegram-compat`  
**Grounded in:**

- fork base `ant013/paperclip:master` at `61eb952e946957b458d26596bfd5aace2fe4db30`;
- current upstream base `paperclipai/paperclip:master` at `009410164fc938f7df462d2780cf409a8bd6db90`;
- reviewed PID-fix head `c40b09b216a316e3bb8b4e0e17419e0c1f336034`;
- legacy fork Telegram compatibility patch `a7185a970b459efafcc994de488dc1a3eeb95a42`;
- live iMac Paperclip `2026.508.0-canary.0` and Telegram plugin
  `paperclip-plugin-telegram@0.6.1-gimle.0`, installed source
  `84c492d987ad0c16dcd224294b0747d60cd0d41f`.

## Goal

Deploy the reviewed embedded-PostgreSQL PID validation fix to the iMac without
breaking the fork-specific Telegram message path. The rollout must retain the
current plugin's legacy UUID-based `ctx.secrets.resolve(...)` contract while
keeping current upstream company scoping and secret-binding enforcement for
the canonical object-shaped contract.

## Observed Compatibility Gap

The live Telegram worker calls `ctx.secrets.resolve(secretUuid)` and stores
`telegramBotTokenRef` as a UUID string. Current upstream requires an object
binding (`{ type: "secret_ref", secretId, ... }`) and rejects string refs. A
plain update from the reviewed PID branch would therefore leave the plugin
registered as `ready` but fail when it resolves the bot token.

The old fork patch cannot be cherry-picked verbatim: all three touched files
conflict with the newer company-scoped implementation. The legacy path must be
ported narrowly into the current handler rather than replacing the new secret
model.

## Assumptions

- The installed Telegram plugin and its stored config remain unchanged during
  this rollout.
- The worker supplies the current `companyId` to the host-side secret service.
- Legacy UUID compatibility is limited to refs explicitly present in the same
  plugin's company-scoped stored configuration.
- When a plugin manifest has a secret-ref schema, that schema remains the
  allow-list. For a legacy schema-less plugin such as the installed Telegram
  build, UUID-shaped values explicitly stored in that same company-scoped
  plugin config are the compatibility allow-list, matching the fork behavior.
- The canonical object-shaped binding path remains the default and is not
  weakened.
- The iMac is restarted only at the Paperclip LaunchAgent level; no machine
  reboot is part of this rollout.

## Scope

### In scope

- Preserve the already-reviewed PID-classification change from `c40b09b`.
- Add a legacy UUID compatibility branch to the current plugin secret handler.
- Require a valid company context for both legacy and canonical paths.
- Authorize a legacy UUID only when it occurs in the same plugin's
  company-scoped stored config: at a schema-declared secret-ref field when a
  schema exists, or as an explicit UUID-shaped config value when the legacy
  plugin has no schema.
- Resolve the authorized secret through the maintained company-scoped secret
  service, retaining audit/access controls.
- Add regression tests for allowed, foreign-company, absent, and malformed
  legacy refs, plus continued canonical binding behavior.
- Build a local npm artifact from the reviewed fork commit, back up the live
  database and current npm installation, install it, restart once, and verify
  Paperclip, PostgreSQL, and Telegram plugin health.

### Out of scope

- Migrating Telegram config and source to the new object-shaped binding API.
- Removing legacy UUID support after that migration.
- Publishing an upstream npm release.
- Merging or closing upstream PR #9769.
- Enabling the separate `fix/disable-agent-auto-recovery` fork branch.
- Rebooting the iMac.

## Affected Areas

- `server/src/services/plugin-secrets-handler.ts`
- `server/src/__tests__/plugin-secrets-handler.test.ts`
- `doc/plans/2026-07-17-imac-pid-telegram-compat-rollout.md`
- fork integration branch and local npm deployment artifact
- iMac global `paperclipai` installation and LaunchAgent lifecycle

No route-level relaxation is planned: new config saves continue to use and
validate the canonical object-shaped secret binding contract.

## Design

1. Keep the existing object-shaped resolution path unchanged.
2. When `params.secretRef` is a string:
   - trim and validate it as a UUID;
   - require `companyId` before database access;
   - load the plugin manifest and the plugin's config for that company;
   - when the manifest declares secret-ref paths, collect legacy UUID values
     only from those paths;
   - when the manifest has no schema, collect UUID-shaped string values from
     that same company-scoped plugin config, preserving the old fork's config
     as explicit-grant boundary;
   - reject refs outside that allow-list with a generic binding/not-found
     error;
   - resolve through `secretService` using the supplied company and legacy ref,
     with plugin-worker access context so cross-company access remains closed.
3. Do not create or infer a canonical binding row for the legacy path. This is
   a compatibility bridge for the already-installed config, not a silent data
   migration.
4. Keep the compatibility code isolated and documented for removal after the
   Telegram plugin/config migration.

## Analog Delta Matrix

| Field | Required content |
| --- | --- |
| Analog family | Primary: current `createPluginSecretsHandler`. Supporting: invocation-scope `resolveRequiredCompanyId`, company-scoped `pluginRegistryService.getConfig`, and `secretService.resolveSecretValueInternal`. Counterexamples: strict canonical config extractor and stale fork commit `a7185a970`. |
| Coverage | Contract, implementation, composition, consumer, lifecycle/error, tests, and counterexample are covered by current-tree Serena + `rg`; historical fork behavior is used only to define compatibility. Paperclip is not indexed in codebase-memory and Palace timed out, so those sources are explicitly waived via recorded YELLOW fallback evidence. |
| Invariants to preserve | Invocation scope supplies company identity; config reads remain plugin+company scoped; canonical object bindings still require binding rows; config-save routes remain strict; secret status/company checks, rate limiting, and access events remain active. |
| Required differences | Add an isolated string-UUID resolution branch. Use schema paths when available; use UUID-shaped values in same-company config only for schema-less legacy plugins. Resolve with access context but without a canonical binding context because the old stored config has no binding row. |
| Rejected differences | Do not copy the stale fork handler, derive company from the secret row, relax config-save validation, auto-migrate config, hard-code Telegram IDs/field names, change routes, or enable unrelated fork branches. |
| Failure modes | Missing/invalid company scope; malformed UUID; UUID absent from the invoking plugin/company config; cross-company secret; inactive/deleted secret or version; ambiguous schema paths; rate-limit exhaustion; schema-less config containing an unintended UUID grant. |
| Tests before code | First add failing integration tests for schema-less allowed UUID and company isolation. Add schema-present allowed/rejected-path cases, malformed/absent ref cases, access-event assertion, and canonical object-binding regression. |
| Verification | Targeted plugin-secret and PID tests; server/package typecheck; repository build/test gates; npm tarball inspection; database backup; controlled iMac restart; Paperclip/PostgreSQL/Telegram invariant smoke. |

The schema-less fallback intentionally inherits one bounded risk from the old
fork: any UUID-shaped value deliberately stored in that plugin/company config
acts as a grant. It is narrower than the old implementation because company
identity comes from the validated invocation scope, configuration is read by
plugin+company, and secret resolution independently rejects cross-company
access. This fallback is removable after Telegram adopts object bindings.

## Tests Before Code

1. A schema-less company-scoped plugin config containing the legacy secret UUID
   resolves it and records a `plugin_worker` access event.
2. The same legacy ref fails from a different company, even if another company
   owns that secret.
3. A well-formed UUID absent from the invoking plugin/company config fails with
   a binding/not-found class error.
4. Malformed and empty string refs fail before provider resolution.
5. With a manifest schema, a UUID at a declared `secret-ref` path resolves,
   while a UUID in an unrelated field does not.
6. Existing object-shaped binding success, ambiguous/missing binding, and
   cross-company tests remain unchanged and green.
7. Existing embedded-PostgreSQL PID identity tests remain green.

## Acceptance Criteria

- Existing canonical object-shaped plugin secret tests remain green.
- A legacy UUID in the same plugin's company-scoped config resolves from a
  schema-declared secret path, or from an explicit UUID-shaped config value for
  a schema-less legacy plugin.
- A UUID belonging to another company, a UUID absent from that config, a UUID
  in a non-secret field when a schema exists, and malformed input all fail
  closed.
- The PID-validation regression tests remain green.
- Typecheck, targeted server tests, full test path required by the repository,
  and npm build complete successfully.
- The fork branch is pushed and reviewable before live installation.
- Before installation, a fresh `paperclipai db:backup --json` succeeds and the
  current global package is archived or its exact npm version is recorded for
  rollback.
- After one controlled LaunchAgent restart:
  - `GET /api/health` returns healthy;
  - port 3100 has exactly one Paperclip listener;
  - embedded PostgreSQL is running from the expected Paperclip binary/data
    directory and its `postmaster.pid` matches that process;
  - `paperclipai plugin list` reports Telegram `ready`;
  - a non-message Telegram runtime probe proves the worker loads and reaches
    the secret-resolution path without exposing or printing the token.
- On any failed invariant, reinstall `paperclipai@2026.508.0-canary.0`, restore
  the archived config/package if needed, and restart the previous LaunchAgent.

## Verification Plan

1. Run focused PID and plugin-secret handler tests.
2. Run repository typecheck and build gates.
3. Build and inspect the npm tarball from the exact fork commit.
4. Capture pre-deploy version, process, port, PID-file, plugin, and health
   evidence on the iMac.
5. Run the database backup while the current service is healthy.
6. Install the tarball and perform one controlled LaunchAgent restart.
7. Repeat the pre-deploy evidence and run a Telegram worker/runtime probe that
   does not send a user-visible message.
8. Keep the old package version and database backup until the deployment has
   remained healthy through the smoke window.

## Open Questions

- None blocking implementation. A real user-visible Telegram message is not
  sent during smoke unless the operator separately requests it; the default
  probe must avoid external messaging while still exercising plugin startup
  and secret resolution.
