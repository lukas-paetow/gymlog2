# Testing plan

## Scope and current status

All development testing runs locally on the Linux PC: Node-based automated tests
plus the Android emulator. No physical phone, hosted service, or CI is required.
iPhone behavior is outside this setup's verified coverage.

The goal is full coverage of our application logic and its specified behavior.
Target **100% statements, branches, functions, and lines** in our TypeScript code.
Coverage means code executed during tests, not proof that every possible input,
device behavior, or bug has been checked. Tests must assert useful outcomes.

The runner and coverage reports are now configured. There are 97 repository tests
across database, date formatting, screen interactions, navigation, and bootstrap.
The last full run measured 99.69% lines, 97.29% statements, 99.11% functions, and
91.54% branches. `database.ts` and `dateFormat.ts` reached 100% on all four metrics.
Re-run coverage after changes; these numbers are a baseline, not a permanent claim.
Native Android behavior still requires the emulator checks below.

## Installed local tools

| Tool | Purpose and tradeoff |
| --- | --- |
| Jest + `jest-expo` | Run tests and measure coverage; Expo's preset handles native-module mocks. Adds development dependencies. |
| React Native Testing Library | Exercise screen interactions and visible results without a native device. Does not test Android rendering or touch behavior. |
| Node's built-in SQLite | Execute actual SQL in isolated temporary databases, with a small adapter implementing the Expo methods we use. Verify the chosen Node version and adapter transaction semantics. |
| Existing Android emulator | Verify native SQLite, app lifecycle, navigation, keyboards, and layout on this PC. Initially use a manual checklist; automate core journeys later if useful. |

Jest and Expo's preset provide one conventional runner for logic and screens.
An alternative is Node's built-in test runner with coverage for database/pure
functions; that avoids a runner dependency but needs separate React Native setup.
Vitest is another runner, but adds no clear benefit for this Expo app initially.
The suite uses Jest 29 with the SDK-compatible Expo 57 preset and React Native
Testing Library. Node 24 or newer is required by the SQLite test adapter. See [Expo's testing guide](https://docs.expo.dev/develop/unit-testing/).

## What coverage must count

Configure Jest `collectCoverageFrom` to include all owned runtime source files,
even when no test imports them: `database.ts`, `dateFormat.ts`, `App.tsx`, screen
files, and any future application helpers. Exclude dependencies, generated docs,
coverage output, test code/fixtures, and declaration files. Do not exclude a screen
or error branch merely to improve the percentage. Explain any legitimate exception.

Use terminal, HTML, and machine-readable coverage reports. The intended HTML
report is `mobile/coverage/lcov-report/index.html`; it should highlight uncovered
lines and branches. Ignore generated coverage files in Git.

The current config enforces all four metrics at 100% for `database.ts` and
`dateFormat.ts`. For the remaining app aggregate, current gates are 95% statements,
87% branches, 96% functions, and 99% lines. Jest subtracts explicitly gated files
from its global threshold calculation; the report still includes all files.
These are regression floors, not the final 100% target.

Once tests cover another area fully, enforce all four metrics at 100% for that area. The final
goal is 100% across owned runtime code, with a failing command when thresholds
are missed. Before then, report the whole app's actual coverage and explicitly
name any scoped gates; passing a partial gate does not mean full app coverage.
Jest supports both file-level and global thresholds; see its
[coverage configuration](https://jestjs.io/docs/configuration#coveragethreshold-object).

Add behavior cases beyond the coverage percentage: a branch executed once may
still fail for a boundary value, different SQL data, or a native implementation.
TypeScript coverage measures JavaScript execution, not SQLite constraint behavior
or native module internals. Those need explicit database and emulator assertions.

## Database test strategy

See [schema-history.md](schema-history.md) for frozen schemas and how to use the
current baseline when adding future migrations.

Import and call the actual exported database functions. Do not copy their SQL or
extract function bodies into a parallel implementation. Replace only the native
module boundary with a real SQLite-backed adapter; mocked query results alone
cannot verify SQL, foreign keys, constraints, or transactions.

Each test gets a fresh database and enables foreign keys. Persistence tests close
and reopen a temporary file. Use fixed clocks for dates, resume windows, and demo
history. Ensure cleanup even after a failure. Never run automated tests against
the user's `gymlog.db`; native tests need an isolated database or a dedicated test
emulator. The tests replace `openDatabaseAsync` with an isolated test connection; production
initialization runs unchanged. The adapter executes SQL with
`node:sqlite`, including transactions and foreign keys. Screen tests mock database
responses and native controls to exercise UI behavior separately.

The frozen `baseline-2026-10-15.sql` represents the currently supported schema.
The pre-baseline fixture and migrations have been retired together. For future
schema changes, add migration tests against this fixed baseline, including repeat
runs, rollback, and data preservation. Do not regenerate an old fixture from the
new schema. Keep native transaction and concurrent-call checks because the desktop
adapter cannot prove Expo behavior.

## Initial behavior inventory

| Area | Required cases |
| --- | --- |
| Initialization/migrations | Fresh database; current baseline rows/history preserved; repeated initialization. For future migrations: old-to-new upgrade, concurrent calls, rollback, and retry. |
| Exercises | Insert/list ordering; delete library and plan links while keeping snapshots/sets; empty lists and database failures. |
| Routines | Create/edit/delete; validation; retain existing day IDs; add/remove/reorder days; reject foreign/duplicate day IDs; partial-write rollback; history unchanged. |
| Set saving | First set creates its logged exercise; later sets reuse it; retry does not duplicate; missing/finished sessions rejected; invalid reps/positions/nonfinite weight; zero and negative weight accepted; failure leaves no partial records. |
| PRs | No baseline; equal/lower/higher reps at same weight; different weights excluded; earlier sets in same session; correct reps at highest weight; negative and zero weights; missing records. |
| Finishing | Finish time stored; retry retains timestamp; nonexistent session fails; save failure keeps UI active; repeated presses and save/finish overlap blocked. |
| Resume | Newest eligible session only; six-hour boundary, just older, future timestamp, finished session, no session; snapshots override plan edits; restore set values/order; next row editable; deleted day/exercise; no duplicate sets after resume. |
| History | Finished only; newest first; multiple sessions/exercises/sets; exclude empty workouts; snapshot names survive deletion; correct exercise/set order; nullable weights. |
| Settings/dates | Missing/invalid preference defaults to DD/MM/YYYY; valid formats persist; System delegates to locale; local midnight rollover/leap day; save failures do not change selected preference. |
| Demo data | Counts/dates/progression; assistance and PR values; preserve existing data; repeated call adds nothing; rollback leaves no marker or partial rows. |
| Timing | Duration logged after success and failure; return values/errors preserved. |

This inventory grows with features. Tests should reveal gaps in current behavior,
not automatically treat today's implementation as the specification.

## Screen tests

Test visible behavior: loading, empty/error states, button presses, confirmation
Cancel/Confirm, draft cancellation, and navigation. Use delayed/rejected saves to
verify that controls disable, completion waits for persistence, failure leaves
input editable, and repeat presses do not duplicate writes.

Cover sequential sets, card expansion, long-press Skip, completed summaries,
resume/finish flows, date selection, history tables, library deletion, and routine
editing. Verify focus reloads data and stale results after blur/unmount are ignored.
Prefer behavioral assertions over large snapshots or tests of private state.

## Local emulator checklist

Use isolated test data and check these journeys after relevant changes:

1. Create/edit a routine; cancel an edit; verify the saved plan.
2. Start a workout; enter negative assistance weight; complete sets sequentially.
3. Background/foreground the app, then force-stop/relaunch; Resume restores saved
   sets and permits saving the next set without duplicates.
4. Finish, cancel confirmation once, then confirm; history shows the correct sets
   and date, and the finished workout is no longer offered for Resume.
5. Change date format, restart, and verify persistence and history display.
6. Delete a library exercise; check plan removal and unchanged history.
7. Load the current baseline on a dedicated test emulator; negative prescriptions
   work and rows survive reinitialization. Add native upgrade checks with future migrations.
8. Check slider dragging, number/decimal/minus entry, scrolling, long-press popup,
   modal closing/back button, and long names at a larger system font size.

Record pass/fail and relevant logs. Component coverage does not replace these checks.

## Commands and rollout

From `mobile/`, run `npm run check` for TypeScript and the coverage-gated suite.
Use `npm run docs` to regenerate TypeDoc. The installed test scripts are:

| Command | Intended result |
| --- | --- |
| `npm test` | One complete automated run; exits on failure. |
| `npm run test:watch` | Re-run relevant tests while editing. |
| `npm run test:coverage` | Full test run, uncovered-file accounting, HTML report, and threshold checks. |
| `npm run check` | TypeScript plus the coverage-gated suite. |

Test layout: `mobile/__tests__/database.test.ts` calls production database functions
through `support/sqlite.ts`; `dateFormat.test.ts` checks formatting; `screens.test.tsx`
checks interactions and delayed/failed operations; `navigation.integration.test.tsx` renders the real App and
navigator to check History/Back and start/finish/Done journeys, session parameters,
and focus reload on return; `bootstrap.test.ts` checks Expo root registration.

Open `mobile/coverage/lcov-report/index.html` after a coverage run and click a file
to inspect missing branches. Isolated screen tests simulate focus through a mounted effect. The navigation
integration suite uses real React Navigation and app screens, with mocked data,
safe-area metrics, and slider rendering. It verifies visible routes, passes a
Back signal to the real navigation subscription (the native header button is not
a JavaScript child), and checks focus reload after finishing. Native header
rendering, physical Back delivery, gestures, and slider behavior still need emulator
checks. See [React Navigation testing guidance](https://reactnavigation.org/docs/testing/). Remaining gaps include defensive guards and some
UI lifecycle/selection branches. Work toward 100% with meaningful behavior tests,
without hiding code or directly invoking private handlers just for percentages.
Native emulator checks remain separate from the automated suite and were not run
as part of the initial test setup.

For each feature: agree behavior → write meaningful tests → implement → run checks
→ inspect coverage gaps and git diff → update this inventory and the project guides.
