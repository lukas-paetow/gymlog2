-- Frozen current schema baseline, captured 2026-10-15.
-- Keep unchanged when adding future migrations; it represents an existing database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS training_days (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    routine_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE (routine_id, position),
    FOREIGN KEY (routine_id) REFERENCES routines(id) 
  );

CREATE TABLE IF NOT EXISTS day_exercises (
    training_day_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    prescribed_sets INTEGER NOT NULL DEFAULT 2 CHECK (prescribed_sets >= 1),
    prescribed_weight_firstset REAL DEFAULT 0,
    prescribed_reps_firstset INTEGER NOT NULL DEFAULT 8 CHECK (prescribed_reps_firstset >= 1),
    PRIMARY KEY (training_day_id, exercise_id),
    UNIQUE (training_day_id, position),
    FOREIGN KEY (training_day_id) REFERENCES training_days(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );

CREATE TABLE IF NOT EXISTS logged_sessions (
    id INTEGER PRIMARY KEY,
    training_day_id INTEGER,
    start_time TEXT NOT NULL,
    finish_time TEXT,
    training_day_name TEXT NOT NULL,
    routine_name TEXT NOT NULL, 
    FOREIGN KEY (training_day_id) REFERENCES training_days(id) ON DELETE SET NULL
  );

CREATE TABLE IF NOT EXISTS logged_exercises (
    id INTEGER PRIMARY KEY,
    exercise_id INTEGER,
    logged_session_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    prescribed_sets INTEGER NOT NULL,
    prescribed_weight_firstset REAL,
    prescribed_reps_firstset INTEGER NOT NULL DEFAULT 8 CHECK (prescribed_reps_firstset >= 1),
    exercise_name TEXT NOT NULL,
    FOREIGN KEY (logged_session_id) REFERENCES logged_sessions(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
  );

CREATE TABLE IF NOT EXISTS logged_sets (
    id INTEGER PRIMARY KEY,
    logged_exercise_id INTEGER NOT NULL,
    order_number INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    rep_pr_improvement INTEGER CHECK (rep_pr_improvement >= 0),
    weight REAL,
    comment TEXT,
    FOREIGN KEY (logged_exercise_id) REFERENCES logged_exercises(id)
  );

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
