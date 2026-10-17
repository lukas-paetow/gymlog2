# Workout data and flow

## Model and conventions

| Table | Meaning |
| --- | --- |
| `exercises` | Library exercise identity and name. |
| `routines` | Groups of training days. |
| `training_days` | Ordered days belonging to one routine. |
| `day_exercises` | Ordered library exercises with prescribed sets and first-set weight/reps. |
| `logged_sessions` | One workout's start/finish times and routine/day name snapshots. |
| `logged_exercises` | An exercise actually performed in a session, with name/prescription snapshots. |
| `logged_sets` | Saved performance: set order, reps, weight, optional comment, and rep PR improvement. |
| `app_settings` | Persistent key/value preferences, currently `date_format`. |

A routine has training days; a day has exercise links. A logged session has
logged exercises, each with logged sets. Logging tables describe performance,
not the plan: do not create logged exercises or sets just because they were prescribed.

- Weight is in kilograms. Negative weight represents assistance; zero is valid.
- Prescribed reps and weight apply only to the first set. All performed sets are logged.
- Prescription reps default to 8 and must be positive integers. Prescription sets default to 2.
- Times are UTC ISO strings from `new Date().toISOString()`.
- Logged exercise positions follow the order in which first sets are successfully
  saved in the active workout, starting at 0. Later card rearrangement does not change them.
- Set order is the zero-based row index within its exercise.
- Snapshot names preserve history. Deleting a referenced day/exercise sets its
  nullable history reference to NULL rather than deleting the logged records.

Library cards have an X button with confirmation. `deleteExercise()` deletes
day links, then the library row, in a transaction. It retains routines/days even
if they become empty. Logged exercise names and sets remain; the foreign key
clears only the library reference. Recreating the same name creates a new library
identity and does not reconnect old records or PRs.

## Edit a routine

View → Edit routine opens the existing editor with copies of the saved days and
prescriptions. Existing day drafts carry an optional `id`; new days have none.
Editing a day replaces its draft in place; removing an exercise from the day
does not delete it from the library. Save calls `updateRoutine()` for an existing
routine and `insertRoutine()` for a new one.

Updates use one transaction, retain the routine and existing day IDs, add new
days, and delete removed days/links. Day positions are temporarily moved negative
inside the transaction to avoid unique-position collisions before assigning the
new order. Day exercise links are replaced; logged snapshots and sets are not.
Removing a day sets its logged-session references to NULL. Other edits retain
session links, so resume still uses snapshots for performed exercises and the
updated plan for unstarted ones.

Cancel discards routine/day drafts. The existing library Add/Delete actions are
immediate database operations, including during editing; canceling the routine
does not undo library changes.

## Start

`SessionScreen.startWorkout()` opens the database and calls `createLoggedSession()`.
That function reads the selected day/routine names, inserts a session with its
start time, and returns its ID. Navigation passes `{ sessionId }` to ActiveSession.

The active screen reads the session, saved sets, and current training-day exercises.
It restores saved exercise snapshots and positions, then adds unstarted exercises
from the live plan. It creates draft rows from prescribed set counts. Only set 1 receives prescribed
reps/weight; later sets start blank. Drafts are not database records.

## Complete a set

1. `completeSet()` validates positive integer reps and a finite weight, including negatives.
2. A ref blocks duplicate presses immediately; state disables controls during saving.
3. The screen assigns/reuses the exercise's workout position and calls `saveCompletedSet()`.
4. In one SQLite transaction, the database function:
   - Checks that the session exists and is unfinished.
   - Finds the logged exercise by session and library exercise ID, or creates its snapshot.
   - Returns an existing set's ID on retry instead of inserting it again.
   - Calculates same-weight rep improvement and inserts the set.
5. After success, the screen marks the draft completed and unlocks the next row.
   On failure, it shows an error and keeps the draft unfinished.

The function returns `{ id, isPersonalRecord }` after the transaction succeeds.
The flag is true only for a newly inserted same-weight rep improvement. Retries
return the existing ID with a false flag. The active screen triggers a roughly
1.5-second "New personal record!" animation without blocking workout controls.
`withTransactionAsync` uses a shared connection. The screen serializes its writes,
but this is not a global database write queue.

## PRs

When saving, compare reps to the highest previously saved reps for the same
library exercise and exact weight, including earlier sets in this session.
`rep_pr_improvement` is NULL without a previous baseline, 0 without improvement,
or the positive rep difference. It records the comparison at save time; corrections
or deletions of history would need consideration before exposing historical PR claims.

The library independently calculates highest weight, then highest reps **at that
weight**. It does not combine unrelated maxima. For assistance, -10 kg ranks above
-30 kg. Saved sets from unfinished sessions count. Exercises without weighted
history remain visible with “No record yet” through LEFT JOINs.

## Complete or skip an exercise

After at least one saved set, Complete exercise locks the card, moves it into the
completed group, and displays only completed sets. Remaining draft sets stay unlogged.
Without saved sets, a long press reveals Skip, which hides the card for this active
screen. Neither action changes the routine or currently writes an exercise status.

## Finish

The bottom button opens confirmation. `confirmFinishWorkout()` blocks further
saves while `finishLoggedSession()` writes `finish_time`. `COALESCE` preserves an
already-written timestamp on retry. A missing session raises an error.

Only a successful save opens the finished summary modal. It includes all sets
completed in screen state, even from exercises not explicitly marked complete.
Done returns to workout selection. Unfinished sets are never automatically logged.

## Finished workout history

Home links to Workout history. On focus, `listFinishedWorkouts()` loads only
sessions with a finish time, newest first, joining saved exercises and sets in
one query. Snapshot names preserve display after template/library deletion.
INNER JOINs require at least one saved set; empty finished sessions stay out of
history, including ones created before this rule. Finishing still closes those
sessions so they are not offered for resume. The function groups rows
into session objects with set arrays. Each card shows the routine and smaller day name on one line, with the local
finish date on the right (no time), and one table row per set: exercise (with set number), weight in kg, and reps.

## Recovery

Workout selection offers a single Resume button only when the newest started
session is unfinished (`finish_time IS NULL`) and within the last six hours. The window is measured
from session start, not last activity. It refreshes on focus and is rechecked when
Resume is pressed. There is no unfinished-workout list. Older sessions remain in
storage but are not offered for resume. Finishing the newest session never
reveals an older one. Starting a new workout closes previous unfinished sessions
and inserts the new session in one transaction. Completed sets remain in history;
empty sessions remain excluded. Repeat starts/resumes are blocked while opening.
Resume uses the existing session ID.
The active screen restores saved reps/weights, locks completed set rows, and
restores exercise positions. New exercises get a position above the restored maximum.
Snapshot names and prescriptions override changed plans for performed exercises.

Exercises with all prescribed sets saved return as completed. Partial exercises
unlock the first unfinished row. Explicit early completion, skipped exercises,
and unsaved draft inputs are not persisted and reset on resume. Deleted library
exercises get negative UI keys based on their logged IDs and appear read-only;
these keys never become library IDs in new writes. If the training day was deleted,
its saved exercises still load, but unstarted exercises cannot be recovered.

The screen uses the live day plan for unperformed exercises, not a complete
start-of-session plan snapshot. A finished session opened directly shows the
restored summary; it cannot accept new sets.

## Schema and timing

Development Settings can call `seedDemoHistory()` to add 18 dated finished sessions
for `[Demo] Bench press`, `[Demo] Squat`, and `[Demo] Assisted dips` (three sets each).
Weights progress every three workouts, with reps increasing at repeated weights.
The seed includes same-weight rep improvement values and negative assistance.
It creates a separate demo routine/day/library exercises, preserving existing data.
One transaction includes the `app_settings.demo_history_v1` marker so retries do
not duplicate the dataset and a failed seed rolls back. The button is visible only
in development. Adding demo data requires pressing it; initialization does not seed.

Settings stores a date format with an upsert under `date_format`; missing or invalid
values fall back to DD/MM/YYYY. Manual formats use local day/month/year fields,
while System uses `toLocaleDateString()` and the runtime's device locale. History
reloads the preference on focus. All stored session timestamps remain UTC ISO
strings; date formatting does not change storage or resume-window calculations.

Initialization creates missing tables and enables foreign keys. The old first-set
reps and signed-weight migrations are retired; fresh databases and the frozen
current baseline are supported. See [schema-history.md](schema-history.md).
Future schema changes need explicit migrations: CREATE TABLE IF NOT EXISTS alone
does not update existing tables.

Database functions use `measureDb()` to log the duration of the entire async
operation, including waiting and result handling. Errors propagate and are timed too.

## Exercise progress

Library-card long press opens Progress for that exercise. The query returns every
saved set with a known weight from finished sessions, including its ID and set
position. All sets is the default mode; points are colored by their set number
within the exercise. Top sets only selects the heaviest set per session, then
most reps, then earliest set, before filtering by selected weight. Axis ranges
stay fixed across selections within a metric. Volume mode sums weight × reps for
all sets of this exercise per session, ignoring the weight filter. Top sets only
uses the single heaviest set instead (with the same tie rules). Exercises with
negative assistance weights have volume disabled because body weight is unknown.

Settings → Add demo history also upgrades existing demo squat fixtures once,
with three varied working sets per session and no warm-ups. It preserves workout
counts and recalculates the demo exercise's PR metadata.

## History calendar

History adds a monthly calendar above the cards. Select a routine to see saved
training-day names on local finish dates; the list below still includes all
workouts. Labels come from each session's name snapshot, so later plan changes
or deletion do not change the displayed day name. Multiple sessions on one date
get separate labels. Weeks use explicit seven-cell rows to avoid column wrapping.

Calendar names are buttons. `onSelectWorkout(sessionId)` reports the selected
session to WorkoutHistoryScreen, which owns selection state and moves that
existing log card directly below the calendar. Other cards stay below it in
their existing order. Both label and card indicate selection. No new query is needed.

In Hypertrophy (+1 rep) mode, a newly saved same-weight rep PR updates this training day’s exercise target
to reps + 1 in the same transaction. The active target updates after success.
Historical logged prescriptions and other training-day plans are unchanged.

## Delete a past workout

Long-press its history card or calendar name to confirm Delete. The screen calls
`deleteFinishedWorkout()`, which validates a finished session and deletes its
logged sets, logged exercises, and session in one transaction. On success the
screen removes its card/calendar entry and clears that selection. Failure retains
the displayed history. Library exercises and training plans are not deleted.
Current PR queries and plots use the remaining sets on their next focus reload.
Stored historical PR deltas and prescribed targets are not rewritten by deletion.


## Initial weight selection

ActiveSessionScreen loads `listLastSetWeights()` once while loading the workout.
The query picks the latest known weight for each exercise ID and zero-based set
position, across training days, excluding the current session. Saved sets count
immediately, including unfinished workouts. Recency follows workout start time,
then session/set IDs to break ties; importing old demo history later does not
replace newer workout values. Null legacy weights are ignored.

Completed rows restored from the current session retain their saved values.
Uncompleted rows start with their historical position's weight; without history,
the first set falls back to its prescribed weight and later sets remain unset.
Extra sets also use their position's historical weight when present, otherwise
they copy the previous set's weight. This only initializes editable drafts; it
neither saves sets nor changes prescriptions, and later renders do not reset edits.

Progress uses the shared WeightPicker in selection-only mode. Its finite list is
the exercise’s recorded weights, capped at the heaviest recorded weight. Wheel
selection filters the existing history and updates plot points without another
database query. Volume mode hides the picker and preserves its selection.


## Exercise comments and tracking exclusions

Long-press an active exercise card (including a completed card) for Add comment
or Exclude sets from tracking. ExerciseOptionsModal owns temporary edits; Save
calls saveExerciseAnnotation, which persists metadata atomically. Failed saves
keep the editor open. Individual choices apply by set position; All sets also
covers subsequently added sets. Skip remains inside the tracking dialog before
any set is completed.

Annotations are separate from performance: saving a note creates metadata but
no completed sets. The first completed set determines the exercise's workout
position. ActiveSessionScreen loads annotations on resume. History shows comments
and excluded-set labels, including notes on exercises with no completed sets when
other exercises in that workout were performed. A workout with no sets stays out
of history.

Exclusions filter library PRs, the baseline for newly saved PRs, and progress data
(including volume/top-set modes). They preserve logged reps/weights and future
weight defaults. Earlier PR flags and prescribed targets are not retroactively
rewritten when a previously logged set is excluded or re-included.


For sets after the first, `listLastSetReps()` supplies the most recent reps for
that exact exercise, set position and weight, excluding the current workout.
These defaults include tracking-excluded sets, as do weight defaults. They load
once with the workout; changing weight uses this cached history rather than
querying SQLite on every wheel movement. Saved rows remain unchanged. Manual
slider changes persist until a different weight with a historical match is chosen.
No match preserves the current slider value; initial unmatched later sets remain
unset. Added sets use matching historical reps, falling back to the previous set.
The first set continues to use its prescribed reps. The slider range includes
historical rep values above 30 so these defaults remain adjustable.


Manual weight entry marks the set draft to remember that weight. Completing the
set adds it to `exercise_weights` in the same transaction as the logged set;
duplicates are ignored. The active screen refreshes its local weight list only
after success. Cancellation, unfinished drafts and failed saves do not add weights.
This stores an individual custom weight, preserving existing increment rules.


Settings stores progression_mode ('hypertrophy' or 'fixed') in app_settings;
missing/unrecognized values default to hypertrophy. Saving a PR checks this mode
in the set transaction. Fixed mode leaves prescriptions unchanged while keeping
PR metadata and celebrations. The save result includes prescribedReps only when
an automatic target update occurred, so the active screen follows the database.
This setting currently controls PR-driven targets, not last-performance defaults.

Logged exercise names prefer the current library name via exercise_id; saved
exercise_name is the fallback after library deletion. History cards, notes and
resumed workouts use this rule. Progress groups by exercise ID and receives the
current name from the library when opened, so renaming does not split history.


## Routine management

One `active_routine_id` value in app_settings represents the selected routine.
getActiveRoutineId validates it against existing routines; setActiveRoutine
validates and replaces the selection atomically. Deleting that routine clears the
setting, preventing a later reused SQLite ID from becoming active accidentally.
RoutineScreen pins the active routine above Inactive routines; workout selection
also shows it first. Activation changes neither history nor existing workouts.

Viewed days render through TrainingDayTable. Tap opens PrescriptionEditor
inside the existing viewing modal. updateExercisePrescription validates sets,
first-set reps, and signed weight, then updates only the matching day/exercise.
Historical logged prescriptions remain snapshots.

Copy loads source days/exercises into a new, editable routine draft without
routine/day IDs. Saving uses insertRoutine, so copies share library exercise
identities but not day prescriptions. Load existing training day queries current
saved days across all routines, filters names locally, and opens an independent
day draft in the existing editor. Source routine names disambiguate duplicate day
names. Deleted days are not retained as a separate template archive.


## Drag ordering

react-native-sortables provides gesture recognition and animated rearrangement,
using Reanimated and Gesture Handler. Sortable.Touchable separates tapping from
holding: home taps navigate; viewed exercise-row taps edit prescriptions; holds
drag. The draft editor uses Sortable.Handle so dragging does not interfere with
text entry. Viewed-day and home orders persist on drop; unsaved drafts persist
only when Save routine is pressed.

Home order is a JSON array of route keys in the existing settings table. Unknown
routes are ignored and new options append after saved options. Day exercise
reordering validates complete membership and updates existing positions in one
transaction, using temporary negative positions to avoid unique-index conflicts.
Prescriptions and logged history are untouched. A failed save restores the prior
visible order and displays an error. No database migration is needed.

Native drag behavior is checked by Lukas in Expo. Jest uses a gesture/animation
boundary mock in __tests__/support/gestures.tsx; focused tests verify save callbacks
and SQLite ordering rather than simulating finger movement.
