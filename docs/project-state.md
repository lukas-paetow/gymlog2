# Project state

GymLog is a learning project: a local-first mobile workout logger built with
Expo, React Native, TypeScript, React Navigation, and SQLite (`expo-sqlite`).
Development uses a Linux PC and Android phone/emulator. iPhone compatibility
is desired; it has not been verified. A web interface is deferred.

## How we work

- The user has scientific C++/Python experience and is learning app development.
- Explain one small feature and its data flow before implementing it.
- Prefer snippets and small user implementation tasks; edit when requested.
- Explain unfamiliar syntax in context. Keep architecture and dependencies simple.
- Preserve the user's changes and learning comments; avoid unrelated refactors.
- Run relevant checks and review the diff after code changes. Do not commit unless asked.
- Follow [AGENTS.md](../AGENTS.md); the project has progressed beyond its initial planning stage.

## Current functionality

- Create routines containing ordered training days and exercise prescriptions.
- Add exercises to the library while building a training day; delete exercises/routines.
- Library cards offer confirmed deletion, removing plan links while preserving
  logged names, sessions, and sets. The routine screen refreshes its library on focus.
- View saved routines and their prescriptions.
- Open Edit routine from View, change names, add/edit/remove days, and adjust
  day exercises/prescriptions. Save applies the draft atomically; Cancel discards it.
- Select a day and start a workout, creating a persistent session row.
- Resume a recent unfinished session (within six hours of its start) from workout selection; restore saved sets and workout order.
- Expand exercise cards to edit reps and weight; sets are editable sequentially.
- Save each completed set immediately. Failed saves leave the set unfinished.
- Complete an exercise after at least one performed set; show its summary above the
  divider separating completed and remaining exercises.
- Long-press an exercise header with no completed sets to reveal Skip.
- Confirm Finish workout, save its finish time, and show a summary modal.
- Browse finished workouts from Home, newest first, with local finish dates (without time) and
  tables of exercise names, weight, and reps for each saved set.
- Settings offers persistent date display formats: DD/MM/YYYY (default),
  MM/DD/YYYY, YYYY-MM-DD, or the device locale. History applies the preference on focus.
- Display library records: highest logged weight and best reps at that weight.
  Records refresh when the library screen gains focus.
- Development Settings offers Add demo history: 18 finished workouts, three
  `[Demo]` exercises, and 162 sets across about eight weeks for plotting experiments.

## Code map

| File | Responsibility |
| --- | --- |
| [App.tsx](../mobile/App.tsx) | Navigation routes and route parameter types. |
| [database.ts](../mobile/database.ts) | Domain types, schema, migration, queries, writes, and timing. |
| [RoutineScreen.tsx](../mobile/screens/RoutineScreen.tsx) | Routine/day drafts, creation, editing, viewing, and deletion. |
| [SessionScreen.tsx](../mobile/screens/SessionScreen.tsx) | Day selection, session creation, and navigation to the workout. |
| [ActiveSessionScreen.tsx](../mobile/screens/ActiveSessionScreen.tsx) | Workout inputs, saving sets, completion/skip state, and finish summary. |
| [ExerciseLibraryScreen.tsx](../mobile/screens/ExerciseLibraryScreen.tsx) | Exercise list and calculated records. |
| [WorkoutHistoryScreen.tsx](../mobile/screens/WorkoutHistoryScreen.tsx) | Finished-session cards and performed-set tables. |
| [SettingsScreen.tsx](../mobile/screens/SettingsScreen.tsx) | Date preference selection, preview, and saving. |
| [dateFormat.ts](../mobile/dateFormat.ts) | Allowed date formats, default, and local-date formatting. |

## Persistence and next work

Completed sets, exercise snapshots, session start time, and finish time survive
app shutdown. Workout selection offers one Resume button for the most recent unfinished session
started within the last six hours, refreshed on screen focus and rechecked on press.
Older sessions remain stored but are not offered for resume.
Resume restores saved performance and positions, using snapshots for started
exercises and the current day plan for unstarted exercises. Deleted library
exercises remain visible as read-only saved summaries; a deleted day retains its
saved exercises but cannot recover unstarted ones.

Unsaved inputs, skipped exercises, and explicit exercise completion are only in
screen state. On resume, exercises with all prescribed sets saved are completed;
partially performed exercises become editable again. Starting another workout
still creates another session; no single-active-session rule is enforced.

Next decisions include persisting drafts and skip/early-completion status, and
whether to snapshot the entire plan at workout start. Verify resume on the phone
by saving a set, closing the app, reopening, and selecting Resume.

Later work includes adding exercises/sets during a workout,
history editing, and plots. Unique indexes for logged exercise/set positions were
discussed but are not implemented; retry protection currently uses lookups and
the active screen's save guard.

## Verification and documentation

[testing.md](testing.md) defines the PC-only test strategy, behavior inventory,
and a 100% code-coverage target. Jest/Expo, a real SQLite test adapter, and screen
tests are installed; `npm run check` checks types and enforced coverage floors.

From `mobile/`, run `npm run check` and `npm run docs` (or `npm test` for tests only).
TypeDoc generates `mobile/docs/api/index.html` from `database.ts` and `dateFormat.ts`; generated files
are ignored by Git. The repository suite has 97 tests; its initial run reached
99.71% line coverage and 91.24% branch coverage, with full measured database/date
coverage. HTML coverage is at `mobile/coverage/lcov-report/index.html`. No lint
script is configured. Native Android interaction still needs emulator testing.

Keep this file and [workout-flow.md](workout-flow.md) current when behavior changes.
Use brief `/** ... */` comments for function contracts rather than documenting
every line of implementation.
