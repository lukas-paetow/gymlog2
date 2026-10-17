# Schema history

Frozen SQL fixtures preserve old database definitions for future migration tests.
They are test inputs, not app initialization scripts or backups of personal data.

| Fixture | Represents |
| --- | --- |
| [baseline-2026-10-15.sql](../mobile/__tests__/fixtures/baseline-2026-10-15.sql) | Baseline table definitions, including reps, signed weights, and settings. Schema only; tests add scenario data. |

For the next schema change, load the current baseline into an isolated database,
add representative saved data, run the new initialization/migration code, and
assert both the new behavior and preservation of existing rows. Test repeat runs
and failure rollback. Keep the baseline unchanged rather than regenerating it
from newer source code. Capture a new dated baseline when useful.

Fixture dates are historical labels, not implemented database version numbers.
Initialization currently creates missing tables; no migrations remain active.

Fresh databases and the current baseline are supported. Databases older than this
baseline are no longer upgraded automatically. They must already have been upgraded
by the previous code, or be explicitly reset in development.

Retired: the pre-baseline schema lacked first-set reps and rejected negative
prescribed weights. Its fixture, tests, and two migrations were removed together
after adopting the current baseline. The lesson remains: CREATE TABLE IF NOT EXISTS
does not update existing tables; future changes require explicit migrations.

The available-weight feature adds `exercise_weights(exercise_id, weight)` with a
composite primary key and cascading exercise deletion. Initialization creates this
additional table for existing installations; it does not alter baseline tables.
The open-ended increment setup also adds `exercise_weight_increments` with
`exercise_id`, `start`, and a positive `increment`, keyed by exercise and start.
Rules apply until the next starting weight, with the last rule continuing upward.
Both tables are created additively; existing explicit weights remain intact.
Profiles are independent copies of values and rules. A manually entered workout
weight is added to the exercise’s custom weights when that set is logged.

Exercise annotations add two tables without changing existing columns:
`logged_exercise_annotations` stores a workout exercise's comment and all-sets
exclusion flag; `logged_set_exclusions` stores excluded set positions. Both refer
to logged exercise IDs and cascade on deletion, preserving annotations when a
library exercise is deleted. A logged exercise row may contain metadata before
any set is performed; only completed sets count as workout performance/history.
