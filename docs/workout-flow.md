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

The function returns the saved/existing set ID; the screen currently does not retain it.
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
LEFT JOINs keep finished sessions without sets visible. The function groups rows
into session objects with set arrays. Each card shows the routine and smaller day name on one line, with the local
finish date on the right (no time), and one table row per set: exercise (with set number), weight in kg, and reps.

## Recovery

Workout selection offers a single Resume button for the newest unfinished session
(`finish_time IS NULL`) started within the last six hours. The window is measured
from session start, not last activity. It refreshes on focus and is rechecked when
Resume is pressed. There is no unfinished-workout list. Older sessions remain in
storage but are not offered for resume. Resume uses the existing session ID.
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

Initialization creates missing tables, enables foreign keys, and runs
`migrateFirstSetReps()`. That migration checks columns before adding first-set rep
targets to existing day/logged exercises, using 8 for existing rows.

Older development databases may still have a non-negative weight CHECK in
`day_exercises`. After the reps migration, `migrateAssistanceWeights()` detects
that legacy check and rebuilds only the linking table in a transaction, copying
its prescriptions and retaining primary/unique/foreign keys. Current schemas
need no rebuild. Editing CREATE TABLE text alone does not alter existing tables.

Database functions use `measureDb()` to log the duration of the entire async
operation, including waiting and result handling. Errors propagate and are timed too.
