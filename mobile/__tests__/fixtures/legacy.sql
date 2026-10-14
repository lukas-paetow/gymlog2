-- Frozen pre-reps schema with the historical non-negative weight constraint.
PRAGMA foreign_keys = ON;
CREATE TABLE routines (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE exercises (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE training_days (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, routine_id INTEGER NOT NULL, position INTEGER NOT NULL,
 UNIQUE(routine_id, position), FOREIGN KEY(routine_id) REFERENCES routines(id)
);
CREATE TABLE day_exercises (
 training_day_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL, position INTEGER NOT NULL,
 prescribed_sets INTEGER NOT NULL DEFAULT 2 CHECK(prescribed_sets >= 1),
 prescribed_weight_firstset REAL NOT NULL DEFAULT 0 CHECK(prescribed_weight_firstset >= 0),
 PRIMARY KEY(training_day_id, exercise_id), UNIQUE(training_day_id, position),
 FOREIGN KEY(training_day_id) REFERENCES training_days(id), FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE TABLE logged_sessions (
 id INTEGER PRIMARY KEY, training_day_id INTEGER, start_time TEXT NOT NULL, finish_time TEXT,
 training_day_name TEXT NOT NULL, routine_name TEXT NOT NULL,
 FOREIGN KEY(training_day_id) REFERENCES training_days(id) ON DELETE SET NULL
);
CREATE TABLE logged_exercises (
 id INTEGER PRIMARY KEY, exercise_id INTEGER, logged_session_id INTEGER NOT NULL, position INTEGER NOT NULL,
 prescribed_sets INTEGER NOT NULL, prescribed_weight_firstset REAL, exercise_name TEXT NOT NULL,
 FOREIGN KEY(logged_session_id) REFERENCES logged_sessions(id),
 FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
);
CREATE TABLE logged_sets (
 id INTEGER PRIMARY KEY, logged_exercise_id INTEGER NOT NULL, order_number INTEGER NOT NULL,
 reps INTEGER NOT NULL, rep_pr_improvement INTEGER CHECK(rep_pr_improvement >= 0), weight REAL, comment TEXT,
 FOREIGN KEY(logged_exercise_id) REFERENCES logged_exercises(id)
);
INSERT INTO routines VALUES(1, 'Original routine');
INSERT INTO exercises VALUES(1, 'Dips');
INSERT INTO training_days VALUES(1, 'Original day', 1, 0);
INSERT INTO day_exercises VALUES(1, 1, 0, 2, 20);
INSERT INTO logged_sessions VALUES(1, 1, '2026-01-01T10:00:00.000Z', '2026-01-01T11:00:00.000Z', 'Original day', 'Original routine');
INSERT INTO logged_exercises VALUES(1, 1, 1, 0, 2, 20, 'Dips');
INSERT INTO logged_sets VALUES(1, 1, 0, 8, 0, 20, NULL);
