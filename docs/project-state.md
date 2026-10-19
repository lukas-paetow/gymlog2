# Project state

Library → Progress → Back preserves the library scroll offset. Focus refreshes
keep existing cards mounted rather than briefly replacing them with a loading
message, and restore the offset after rendering the refreshed records.
WorkoutSetTable is shared by finished summaries and history: compact kg × reps
rows, no set-number prefixes, and green PR badges from saved rep_pr_improvement.
Post-workout summary tables left-align weight × reps, with PR badges and a
rightmost Set column displaying the set number only.
Active drafts retain their PR flag on save/resume. Routine tables order kg before
reps too. Routine creation/editing and prescription forms use KeyboardAvoidingView
plus focused-input scrolling to keep fields above the keyboard.
History card/calendar long press offers Edit/Delete/Cancel. Edit highlights the
workout with row-edit instructions; double-tapping a row (also a direct shortcut)
opens EditLoggedSetModal with kg then reps, supporting decimal commas and negative
weights. updateLoggedSet validates ownership and finished status, updates the set,
and recalculates that exercise's chronological same-weight PR markers in one
transaction. Excluded/null-weight sets do not establish PRs; prescriptions remain
unchanged. Deleted-library exercise history groups by its saved name. History
reloads after saving, so corrected values and badges refresh together.
Edit mode also offers Add set with a chooser of already-logged exercises, followed
by kg/reps entry. The row editor offers confirmed Delete set. addLoggedSet and
deleteLoggedSet share transactional chronological PR rebuilding with corrections.
New sets append after the exercise's maximum recorded position; deletion keeps
surviving positions stable and removes that position's exclusion. A finished
workout with no remaining sets automatically stops appearing in history.

The active-workout exercise-history modal includes ExerciseProgressChart above
the full history cards. Its plot filters to the preceding two calendar months,
excludes tracking-excluded and null-weight sets, and starts at the latest logged
weight. The shared vertical WeightPicker switches among recorded recent weights,
with no manual entry or inferred higher weights; touching it pauses modal scrolling.
Colors show set number.
The history popup header shows the all-time rep PR at the wheel's selected
weight (tracking exclusions omitted), even when that record predates the plot's
two-month window. If there is no recent plotted weight, use the last tracked weight.
Older workouts remain in the history list. The existing history query supplies
the plot without an additional database read.

RepSlider's visible range is now eight reps (nine integer ticks). Tick marks are
overlaid directly across the native slider track with pointer events disabled;
small labels below the track mark multiples of five. This replaces StepMarker,
whose layout placed marks above the track. Arrow range controls are retained.

RepSlider now uses the slider library's StepMarker to draw a small vertical tick
at each integer rep. Left/right arrow buttons shift the range and selected value
by five reps, with accessible labels. ActiveSession offers Add unplanned exercise
above Finish: AddWorkoutExercise loads the library, filters names as typed, hides
already-added exercises and provides tappable suggestions. Selection appends an
expanded one-set draft with last weight/PR defaults and weight options. No routine
changes or logged sets are written until actual completion. Unperformed additions
remain transient; performed ones resume via their normal saved snapshots.
Sparse inferred weights now use 1 kg for singleton integer observations (9 →
10,11,…), 0.5 kg for half-kg observations, and 1.25 kg only on a supported 1.25-kg
grid. Large gaps between only two observations fall back to that smaller step.
Singleton remembered weight profiles get inference too; explicit increment rules
and multi-weight lists retain precedence.

Active-workout defaults now retain the last-used weight per set position and
use the tracked rep PR at that exact weight/position (first set +1 in hypertrophy
mode, no +1 in fixed mode). `listSetRepRecords` excludes the current session and
tracking-excluded sets. Saved sets are never overwritten. If no weight profile
is configured, inferWeightOptions preserves logged weights and adds five higher
choices using the commonest positive gap (smallest on ties, 2.5 kg for one weight).
These are inferred suggestions, not persisted equipment rules. Explicit profiles
take precedence. RepSlider shows a stable ten-rep window and −5/+5 buttons to
recenter at other counts. Selecting the dash in WeightPicker retains its anchor,
so a lone custom/default weight does not disappear.

WeightPicker now opens manual entry on two short taps (within 300ms); drags and
holds do not count as taps. Accessibility activation remains available. Generated
weight lists are memoized, selection updates are deferred while touched, and a
changed list remounts the native wheel to reset its index-based animations. This
addresses disappearing items when moving between generated weight windows.
Active-session long press now opens a custom four-action menu (Android alerts
only allow three buttons), adding View exercise history alongside comment and
tracking actions. ExerciseHistoryModal loads finished sets for that exercise,
excluding the current workout, with dates, comments and tracking exclusions.
It is read-only and leaves active drafts intact. Lukas chose last-used weights
with per-position rep PR defaults.

Routine table headings now use Reps and kg without superscripts. Weight-entry
fields use the regular keyboard so commas, decimal points, and negative signs
are available. Routine day drafts retain raw weight input text while typing;
validation and existing comma-to-point normalization handle saved numbers.

The shared weight wheel uses 120-unit width, 48-unit rows, and tap-to-select
adjacent values. ActiveSession and Progress pause their surrounding ScrollView
while a wheel is touched, restoring scrolling on touch end or cancellation.

Progress charts switch to year labels and stronger year boundaries for histories
covering at least one calendar year. Day ticks and month labels are hidden at that
scale; faint monthly guides remain. Short histories keep the existing date axis.

## Legacy dataset preparation

The original `~/gymdata` has been converted into a separate additional dataset,
named Legacy: see [data/legacy/README.md](../data/legacy/README.md).
`scripts/build_legacy.py` generates SQLite and portable JSON artifacts, retaining
source text, approved exercise mappings, estimated-date provenance, and a review
report. Be means Back extension; Lrm means Machine lateral raise, distinct from
the single ignored `Lr m trying out` entry. Six focused Python conversion tests
cover parsing, mappings, dates, source accounting, and SQLite integrity/rebuilds.
Legacy format v2 stores trailing prose as comments and excludes source entries
26–27 from tracking while retaining their four sets. Cp means Chest press;
Pu ng h merges into Pu ng. Mr in the Japanese-gym period (late September 2024
through March 2025) is Machine row (partial), distinct from Machine row elsewhere.
Settings now offers Import Legacy. `mobile/legacyImport.ts` imports the compact
generated `mobile/data/legacy.json` atomically: 278 finished workouts, 5,973 sets,
matching case-insensitive exact library names and creating unmatched exercises.
History is labeled Legacy; comments/exclusions are retained. Imported performance
contributes to plots and future PR comparisons, but historical PR badges and
routine prescriptions are untouched. app_settings/legacy_import_v1 prevents
duplicates and stores source/date provenance. Dates use local noon placeholders.
Lukas accepted the four estimated dates and requested removing all other flagged
entries, including their sets. The converter now applies that deletion and stores
removed source line numbers for provenance; the embedded original remains intact.
Generating the artifacts alone does not change current app data; importing is explicit.

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
  Once all current sets are saved, Add set appends another draft with the previous
  set’s values. Complete exercise is disabled while its card is collapsed.
- Weight pickers start from the latest saved weight at the same exercise/set
  position, including added sets. Resuming preserves this session’s saved values.
- Exercise weights are configured through start/increment rules, individual values, or an independent
  copy from another exercise. Library → Weights edits existing exercises; the training
  day editor offers configuration when creating exercises. Active workouts use a
  reusable wheel picker; hold it for manual entry. A manually entered weight becomes a permanent custom
  weight when its set is successfully logged.
  There is no end-weight field: each rule runs until the next starting weight;
  the last continues as you scroll. A moving window keeps generated lists small.
- Save each completed set immediately. Failed saves leave the set unfinished.
- A newly saved same-weight rep PR triggers a short fade/rise/scale animation reading
  "New personal record!". First baselines, ties, and idempotent retries do not celebrate.
  A new PR also sets this day/exercise prescription to PR reps + 1 in the save
  transaction and updates the active target. Existing targets are not normalized
  until another PR occurs; historical prescription snapshots are preserved.
- Complete an exercise after at least one performed set; show its summary above the
  divider separating completed and remaining exercises.
- Long-press an exercise header with no completed sets to reveal Skip.
- Confirm Finish workout, save its finish time, and show a summary modal.
- Long-press a past workout card or its calendar name for a Cancel/Delete confirmation.
  Successful deletion removes that session’s logged sets/exercises and calendar entry;
  plans and library exercises remain. Failed deletes keep the card visible.
- Browse finished workouts with at least one saved set from Home, newest first, with local finish dates (without time) and
  tables of exercise names, weight, and reps for each saved set.
- History includes a Monday-first monthly calendar, routine selection, and training-day
  name labels on local finish dates. Multiple sessions on a date remain visible.
  Labels use the names saved with the session, including deleted training days.
  Tap a name to highlight its session and move its log card directly below the calendar.
  Other cards retain their relative order; no additional database read is needed.
- Settings offers persistent date display formats: DD/MM/YYYY (default),
  MM/DD/YYYY, YYYY-MM-DD, or the device locale. History applies the preference on focus.
- Long-press a library exercise to open Progress: select a logged weight (including assistance)
  and plot individual completed sets against elapsed time. Set number determines dot
  color, with a legend; a mode button restricts results to one top set per session
  (heaviest weight, then most reps, then earliest set). Dates follow Settings.
  Gifted Charts renders through a reusable component; the compact calendar axis has
  day ticks and faint month markers. Axis ranges stay fixed across weight selections
  for an exercise; point padding prevents clipping. Volume mode sums weight × reps
  across all sets of this exercise per workout; Top sets only uses its heaviest set.
  The weight filter and set-color legend are hidden in volume mode. Volume is disabled
  when this exercise history contains negative assistance weights.
- Display library records: highest logged weight and best reps at that weight.
  Records refresh when the library screen gains focus.
- Development Settings offers Add demo history: 18 finished workouts, three
  `[Demo]` exercises, and 162 sets across about eight weeks for plotting experiments.
  Running Add demo history again upgrades existing squat fixtures once: varied
  working-set weights and reps, with the heaviest set sometimes second. No warm-ups.

## Code map

| File | Responsibility |
| --- | --- |
| [App.tsx](../mobile/App.tsx) | Navigation routes and route parameter types. |
| [database.ts](../mobile/database.ts) | Domain types, schema, queries, writes, and timing. |
| [RoutineScreen.tsx](../mobile/screens/RoutineScreen.tsx) | Routine/day drafts, creation, editing, viewing, and deletion. |
| [SessionScreen.tsx](../mobile/screens/SessionScreen.tsx) | Day selection, session creation, and navigation to the workout. |
| [ActiveSessionScreen.tsx](../mobile/screens/ActiveSessionScreen.tsx) | Workout inputs, saving sets, completion/skip state, and finish summary. |
| [ExerciseLibraryScreen.tsx](../mobile/screens/ExerciseLibraryScreen.tsx) | Exercise list and calculated records. |
| [ProgressScreen.tsx](../mobile/screens/ProgressScreen.tsx) | History loading, weight selection, and chart data preparation. |
| [ExerciseProgressChart.tsx](../mobile/components/ExerciseProgressChart.tsx) | Reusable chart rendering using Gifted Charts, sized to its container. |
| [exerciseProgress.ts](../mobile/exerciseProgress.ts) | Top-set selection, per-session volume aggregation, and stable set-number colors. |
| [chartDateAxis.ts](../mobile/chartDateAxis.ts) | Calendar day/month positions and label density for plots. |
| [PersonalRecordCelebration.tsx](../mobile/components/PersonalRecordCelebration.tsx) | Brief non-blocking PR animation using React Native Animated. |
| [WorkoutCalendar.tsx](../mobile/components/WorkoutCalendar.tsx) | Monthly calendar, routine selector, and saved training-day names. |
| [workoutCalendar.ts](../mobile/workoutCalendar.ts) | Local-date keys, routine grouping, and Monday-first month grids. |
| [WorkoutHistoryScreen.tsx](../mobile/screens/WorkoutHistoryScreen.tsx) | Finished-session cards and performed-set tables. |
| [SettingsScreen.tsx](../mobile/screens/SettingsScreen.tsx) | Date preference selection, preview, and saving. |
| [dateFormat.ts](../mobile/dateFormat.ts) | Allowed date formats, default, and local-date formatting. |

## Persistence and next work

Completed sets, exercise snapshots, session start time, and finish time survive
app shutdown. Workout selection offers one Resume button for the newest session if it is unfinished and
started within the last six hours, refreshed on screen focus and rechecked on press.
Older sessions remain stored but are not offered for resume.
Resume restores saved performance and positions, using snapshots for started
exercises and the current day plan for unstarted exercises. Deleted library
exercises remain visible as read-only saved summaries; a deleted day retains its
saved exercises but cannot recover unstarted ones.

Unsaved inputs, skipped exercises, and explicit exercise completion are only in
screen state. On resume, exercises with all prescribed sets saved are completed;
partially performed exercises become editable again. Starting another workout
atomically closes earlier unfinished sessions and creates the new one. Saved sets
remain in history; empty sessions stay excluded. Finishing never revives older
unfinished sessions. Start and Resume are guarded while an open is in flight.

Next decisions include persisting drafts and skip/early-completion status, and
whether to snapshot the entire plan at workout start. Verify resume on the phone
by saving a set, closing the app, reopening, and selecting Resume.

Later work includes adding exercises/sets during a workout,
history editing, and additional plot metrics. Top set means heaviest weight (best reps
break ties); assisted-exercise volume is deferred because body weight is unknown. Unique indexes for logged exercise/set positions were
discussed but are not implemented; retry protection currently uses lookups and
the active screen's save guard.

## Verification and documentation

[testing.md](testing.md) defines the PC-only test strategy, behavior inventory,
and a 100% code-coverage target. Jest/Expo, a real SQLite test adapter, and screen
tests are installed; `npm run check` checks types and enforced coverage floors.

From `mobile/`, run `npm run check` and `npm run docs` (or `npm test` for tests only).
TypeDoc generates `mobile/docs/api/index.html` from `database.ts` and `dateFormat.ts`; generated files
are ignored by Git. The repository suite has 176 tests; the latest run reached
99.63% line coverage and 93.98% branch coverage, with full measured database/date
coverage. HTML coverage is at `mobile/coverage/lcov-report/index.html`. No lint
script is configured. Native Android interaction still needs emulator testing.

Keep this file and [workout-flow.md](workout-flow.md) current when behavior changes.
Use brief `/** ... */` comments for function contracts rather than documenting
every line of implementation.

Database initialization now shares one promise and owned SQLite connection per app
run (`useNewConnection: true` avoids Expo's cached native-handle reuse). Screens
await the same schema setup; failed initialization clears the promise for retry.
Navigation refocus reloads queries without reopening SQLite. This addresses the
suspected native-handle lifecycle problem; verify Progress → Back after a full reload.

Progress reuses WeightPicker in selection-only mode: sorted distinct recorded
weights, initially the heaviest, with no empty entry or manual entry. Its maximum
is the highest recorded weight. Volume mode hides it and returning to reps keeps
the selection.

Active exercise cards now offer Add comment and Exclude sets from tracking on
long press, including completed cards. The tracking dialog selects individual
positions or all current/future sets; Skip lives there before any completed set.
Comments and exclusions persist immediately, restore on resume, and appear in
history. Exclusions affect PR calculations/library records and plots, including
volume; weight defaults and logged performance remain intact. Previously saved
PR deltas and already-updated prescribed targets are not retroactively rewritten.
Current preference: keep tests/checking lighter during UI iteration; let Lukas
check the app instead of expanding coverage for every small change.

Later active-workout sets default reps from the last performance at the same
exercise, set position and weight; selecting a different weight refreshes that
default from cached history. First-set prescribed targets and saved rows are kept.

Settings → Workout targets selects Hypertrophy (+1 rep), the default, or Fixed
targets. The setting is saved in app_settings as progression_mode. In fixed mode,
PRs still record and celebrate but do not update prescribed reps. ActiveSession
only updates its displayed target when the database returns prescribedReps.
Last-performance wheel/slider defaults currently apply in both modes.

Logged exercise names prefer the current library name via exercise_id; saved
exercise_name is the fallback after library deletion. History cards, notes and
resumed workouts use this rule. Progress groups by exercise ID and receives the
current name from the library when opened, so renaming does not split history.

Routine viewing now uses compact TrainingDayTable components (exercise, sets,
first-set reps and kg). Hold a row to edit through PrescriptionEditor; saving
updates that day/exercise only. RoutineScreen offers Make active, Copy, and Load
existing training day with case-insensitive day-name search. The active routine
is pinned above a divider; SessionScreen also puts it first. No active routine is
chosen automatically. Copies reuse exercise IDs but create independent routine
and day IDs when saved. The reusable-day list includes all currently stored days
from active/inactive routines, labeled with source routine names.

Sortables now handles hold-and-drag rearrangement. StartScreen uses Sortable.Grid with columns={2}
to keep equal square tiles in exactly two columns; drop order is
stored in app_settings/start_screen_order. Viewed training-day tables use
Sortable.Grid: tap opens prescription editing, hold drags within that day, and
SQLite positions save on drop. Draft day exercises also reorder via dedicated
handles, with the order saved when the routine is saved. App and Android modal
contents have GestureHandlerRootView wrappers; animated scroll refs allow auto
scroll during dragging. Reanimated 4.5.1 / Worklets 0.10.1 match Expo SDK 57.

Routine deletion is available inside the existing routine editor (View → Edit
routine), with confirmation; it is no longer on overview rows. Successful deletion
closes the editor.
