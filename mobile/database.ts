import * as SQLite from 'expo-sqlite';
import { normalizeIncrements, normalizeWeights } from './weightOptions';
import type { WeightIncrement, WeightOptions } from './weightOptions';
import { DEFAULT_DATE_FORMAT, isDateFormat } from './dateFormat';
import type { DateFormat } from './dateFormat';

// TypeScript types
export type Exercise = {
  id: number;
  name: string;
};

export type ExerciseWithRecord = Exercise & {
  heaviestWeight: number | null;
  repsAtHeaviestWeight: number | null;
};

export type UnfinishedSession = {
  id: number;
  trainingDayName: string;
  routineName: string;
  startTime: string;
};

export type FinishedWorkout = {
  id: number;
  routineId: number | null;
  trainingDayNumber: number | null;
  trainingDayName: string;
  routineName: string;
  finishTime: string;
  exerciseNotes?: { exerciseName: string; comment: string }[];
  sets: {
    id: number;
    loggedExerciseId?: number;
    exerciseName: string;
    exerciseComment?: string;
    excludedFromTracking?: boolean;
    setPosition: number;
    weight: number | null;
    reps: number;
    recordKind?: 'pr' | 'submaximal' | null;
    repPrImprovement?: number | null;
  }[];
};

export type SavedSessionSet = {
  recordKind?: 'pr' | 'submaximal' | null;
  repPrImprovement?: number | null;
  loggedExerciseId: number;
  exerciseId: number | null;
  name: string;
  position: number;
  prescribedSets: number;
  prescribedWeightFirstSet: number | null;
  prescribedRepsFirstSet: number;
  setPosition: number;
  reps: number;
  weight: number | null;
};

// an intersection type
export type TrainingDayExercise = Exercise & {
  prescribedSets: number;
  prescribedWeightFirstSet: number;
  prescribedRepsFirstSet: number;
};

// contains its own info on where it fits in with routine
export type TrainingDay = {
  id: number;
  name: string;
  position: number;
  routineId: number;
};

export type Routine = {
  id: number;
  name: string;
};

// for drafting
export type TrainingDayDraft = {
  id?: number; // Present when editing an existing day; absent for a new day.
  name: string;
  exercises: DayExerciseDraft[];
};

// for drafting 
export type DayExerciseDraft = Omit<TrainingDayExercise, 'name'>;



export const createRoutinesTable = `
  CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );
`;


export const createExercisesTable = `
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exercise_notes (
    exercise_id INTEGER PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
    note TEXT NOT NULL
  );
`;

export const createLoggedSessionsTable = `
  CREATE TABLE IF NOT EXISTS logged_sessions (
    id INTEGER PRIMARY KEY,
    training_day_id INTEGER,
    start_time TEXT NOT NULL,
    finish_time TEXT,
    training_day_name TEXT NOT NULL,
    routine_name TEXT NOT NULL, 
    FOREIGN KEY (training_day_id) REFERENCES training_days(id) ON DELETE SET NULL
  );
`;

export const createLoggedExerciseTable = `
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
`;

export const createLoggedSetTable = `
  CREATE TABLE IF NOT EXISTS logged_sets (
    id INTEGER PRIMARY KEY,
    logged_exercise_id INTEGER NOT NULL,
    order_number INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    record_kind TEXT CHECK (record_kind IN ('pr', 'submaximal')),
    rep_pr_improvement INTEGER CHECK (rep_pr_improvement >= 0),
    weight REAL,
    comment TEXT,
    FOREIGN KEY (logged_exercise_id) REFERENCES logged_exercises(id)
  );
`;

export type ExerciseAnnotation = { comment: string; excludeAll: boolean; excludedPositions: number[] };
export type SavedExerciseAnnotation = ExerciseAnnotation & TrainingDayExercise & { exerciseId: number | null; loggedExerciseId: number };

export const createExerciseAnnotationsTables = `
  CREATE TABLE IF NOT EXISTS logged_exercise_annotations (
    logged_exercise_id INTEGER PRIMARY KEY REFERENCES logged_exercises(id) ON DELETE CASCADE,
    comment TEXT NOT NULL DEFAULT '',
    exclude_all INTEGER NOT NULL DEFAULT 0 CHECK (exclude_all IN (0, 1))
  );
  CREATE TABLE IF NOT EXISTS logged_set_exclusions (
    logged_exercise_id INTEGER NOT NULL REFERENCES logged_exercises(id) ON DELETE CASCADE,
    set_position INTEGER NOT NULL CHECK (set_position >= 0),
    PRIMARY KEY (logged_exercise_id, set_position)
  );
`;

function trackedSetCondition(sets: string, exercises: string): string {
  return `NOT EXISTS (SELECT 1 FROM logged_exercise_annotations AS notes
          WHERE notes.logged_exercise_id = ${exercises}.id AND notes.exclude_all = 1)
      AND NOT EXISTS (SELECT 1 FROM logged_set_exclusions AS excluded
          WHERE excluded.logged_exercise_id = ${exercises}.id AND excluded.set_position = ${sets}.order_number)`;
}

async function findOrCreateLoggedExercise(db: SQLite.SQLiteDatabase, sessionId: number, exercise: TrainingDayExercise, position: number): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM logged_exercises WHERE logged_session_id = ? AND exercise_id = ?', sessionId, exercise.id
  );
  if (existing) return existing.id;
  const result = await db.runAsync(
    `INSERT INTO logged_exercises (exercise_id, logged_session_id, position, exercise_name,
      prescribed_sets, prescribed_weight_firstset, prescribed_reps_firstset) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    exercise.id, sessionId, position, exercise.name, exercise.prescribedSets,
    exercise.prescribedWeightFirstSet, exercise.prescribedRepsFirstSet
  );
  return result.lastInsertRowId;
}

export async function saveExerciseAnnotation(db: SQLite.SQLiteDatabase, sessionId: number, exercise: TrainingDayExercise, annotation: ExerciseAnnotation): Promise<void> {
  return measureDb('saveExerciseAnnotation', () => db.withTransactionAsync(async () => {
    if (annotation.excludedPositions.some(position => !Number.isInteger(position) || position < 0)) throw new Error('Invalid set position');
    const session = await db.getFirstAsync<{ finish_time: string | null }>('SELECT finish_time FROM logged_sessions WHERE id = ?', sessionId);
    if (!session || session.finish_time !== null) throw new Error('Workout is not active');
    // Metadata can exist before the first performed set; history still requires saved sets.
    const id = await findOrCreateLoggedExercise(db, sessionId, exercise, 0);
    await db.runAsync(`INSERT INTO logged_exercise_annotations (logged_exercise_id, comment, exclude_all) VALUES (?, ?, ?)
      ON CONFLICT(logged_exercise_id) DO UPDATE SET comment = excluded.comment, exclude_all = excluded.exclude_all`,
      id, annotation.comment.trim(), annotation.excludeAll ? 1 : 0);
    await db.runAsync('DELETE FROM logged_set_exclusions WHERE logged_exercise_id = ?', id);
    for (const position of new Set(annotation.excludedPositions)) {
      await db.runAsync('INSERT INTO logged_set_exclusions (logged_exercise_id, set_position) VALUES (?, ?)', id, position);
    }
  }));
}

export async function listExerciseAnnotations(db: SQLite.SQLiteDatabase, sessionId: number): Promise<SavedExerciseAnnotation[]> {
  return measureDb('listExerciseAnnotations', async () => {
    const rows = await db.getAllAsync<TrainingDayExercise & { exerciseId: number | null; loggedExerciseId: number; comment: string; excludeAll: number; setPosition: number | null }>(
      `SELECT exercises.id AS loggedExerciseId, exercises.exercise_id AS exerciseId,
              COALESCE(library.name, exercises.exercise_name) AS name, exercises.prescribed_sets AS prescribedSets,
              exercises.prescribed_weight_firstset AS prescribedWeightFirstSet,
              exercises.prescribed_reps_firstset AS prescribedRepsFirstSet,
              notes.comment, notes.exclude_all AS excludeAll, excluded.set_position AS setPosition
       FROM logged_exercises AS exercises
       LEFT JOIN exercises AS library ON library.id = exercises.exercise_id
       JOIN logged_exercise_annotations AS notes ON notes.logged_exercise_id = exercises.id
       LEFT JOIN logged_set_exclusions AS excluded ON excluded.logged_exercise_id = exercises.id
       WHERE exercises.logged_session_id = ? ORDER BY exercises.position, excluded.set_position`, sessionId
    );
    const annotations = new Map<number, SavedExerciseAnnotation>();
    for (const row of rows) {
      let annotation = annotations.get(row.loggedExerciseId);
      if (!annotation) {
        annotation = { ...row, id: row.exerciseId ?? -row.loggedExerciseId, excludeAll: row.excludeAll === 1, excludedPositions: [] };
        annotations.set(row.loggedExerciseId, annotation);
      }
      if (row.setPosition !== null) annotation.excludedPositions.push(row.setPosition);
    }
    return [...annotations.values()];
  });
}

// Positions come from the active workout, not the training-day template.
// Assign the exercise position on its first saved set and retain it afterward.
export type SavedSetResult = { id: number; isPersonalRecord: boolean; isSubmaximalRecord?: boolean; prescribedReps?: number };

export async function saveCompletedSet(
    db: SQLite.SQLiteDatabase,
    sessionId: number,
    exercise: TrainingDayExercise,
    workoutExercisePosition: number,
    setPosition: number,
    reps: number,
    weight: number,
    rememberWeight = false,
): Promise<SavedSetResult> {
    return measureDb('saveCompletedSet', async () => {
        if (!Number.isInteger(reps) || reps < 1
            || !Number.isFinite(weight) 
            || !Number.isInteger(workoutExercisePosition) || workoutExercisePosition < 0
            || !Number.isInteger(setPosition) || setPosition < 0) {
            throw new Error('Invalid set values');
        }

        let setId = 0;
        let isPersonalRecord = false;
        let isSubmaximalRecord = false;
        let prescribedReps: number | undefined;

        await db.withTransactionAsync(async () => {
            const session = await db.getFirstAsync<{
                finish_time: string | null;
                training_day_id: number | null;
            }>(
                'SELECT finish_time, training_day_id FROM logged_sessions WHERE id = ?',
                sessionId,
            );

            if (!session) throw new Error('Session not found');
            if (session.finish_time !== null) {
                throw new Error('Session already finished');
            }

            const loggedExercise = { id: await findOrCreateLoggedExercise(db, sessionId, exercise, workoutExercisePosition) };

            // Retrying a saved set returns its ID without logging it twice.
            const existingSet = await db.getFirstAsync<{ id: number }>(
                `SELECT id FROM logged_sets
                 WHERE logged_exercise_id = ? AND order_number = ?`,
                loggedExercise.id,
                setPosition,
            );

            if (existingSet) {
                setId = existingSet.id;
                return;
            }

            await db.runAsync(`UPDATE logged_exercises SET position = ? WHERE id = ? AND NOT EXISTS
              (SELECT 1 FROM logged_sets WHERE logged_exercise_id = ?)`, workoutExercisePosition, loggedExercise.id, loggedExercise.id);
            const excluded = await db.getFirstAsync<{ id: number }>(
              `SELECT id FROM logged_exercises WHERE id = ? AND (
                EXISTS (SELECT 1 FROM logged_exercise_annotations WHERE logged_exercise_id = ? AND exclude_all = 1)
                OR EXISTS (SELECT 1 FROM logged_set_exclusions WHERE logged_exercise_id = ? AND set_position = ?))`,
              loggedExercise.id, loggedExercise.id, loggedExercise.id, setPosition
            );
            const record = await db.getFirstAsync<{ maxReps: number | null }>(
                `SELECT MAX(logged_sets.reps) AS maxReps
                 FROM logged_sets
                 JOIN logged_exercises
                   ON logged_exercises.id = logged_sets.logged_exercise_id
                 WHERE logged_exercises.exercise_id = ?
                   AND logged_sets.weight = ? AND ${trackedSetCondition('logged_sets', 'logged_exercises')}`,
                exercise.id,
                weight,
            );

            const heaviest = await db.getFirstAsync<{ weight: number | null }>(
              `SELECT MAX(sets.weight) AS weight FROM logged_sets AS sets
               JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
               WHERE exercises.exercise_id = ? AND ${trackedSetCondition('sets', 'exercises')}`, exercise.id);
            const previousWeight = heaviest?.weight ?? null;
            const previousMax = record?.maxReps ?? null; // optional chaining - only if record exists, else null
            const improvement = excluded || previousMax === null
                ? null
                : Math.max(0, reps - previousMax);

            isPersonalRecord = !excluded && previousWeight !== null &&
              (weight > previousWeight || (weight === previousWeight && (improvement ?? 0) > 0));
            isSubmaximalRecord = !excluded && previousWeight !== null && weight < previousWeight && (improvement ?? 0) > 0;
            const recordKind = isPersonalRecord ? 'pr' : isSubmaximalRecord ? 'submaximal' : null;
            const result = await db.runAsync(
                `INSERT INTO logged_sets (
                    logged_exercise_id, order_number,
                    reps, weight, rep_pr_improvement, record_kind
                 ) VALUES (?, ?, ?, ?, ?, ?)`,
                loggedExercise.id,
                setPosition,
                reps,
                weight,
                improvement,
                recordKind,
            );

            if (rememberWeight) {
                await db.runAsync(`INSERT INTO exercise_weights (exercise_id, weight) VALUES (?, ?)
                  ON CONFLICT(exercise_id, weight) DO NOTHING`, exercise.id, weight);
            }
            setId = result.lastInsertRowId;
            if ((isPersonalRecord || isSubmaximalRecord) && await getProgressionMode(db) === 'hypertrophy') {
                await db.runAsync(
                    `UPDATE day_exercises SET prescribed_reps_firstset = ?
                     WHERE training_day_id = ? AND exercise_id = ?`,
                    reps + 1, session.training_day_id, exercise.id,
                );
                prescribedReps = reps + 1;
            }
        });

        return { id: setId, isPersonalRecord, ...(isSubmaximalRecord ? { isSubmaximalRecord } : {}), ...(prescribedReps === undefined ? {} : { prescribedReps }) };
    });
}


// connect routines and trainingDays
// primary key: unique
// foreign key: required to exist elsewhere
export const createTrainingDaysTable = `
  CREATE TABLE IF NOT EXISTS training_days (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    routine_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    UNIQUE (routine_id, position),
    FOREIGN KEY (routine_id) REFERENCES routines(id) 
  );
`;

// linking table of days and exercises
export const createDayExercisesTable = `
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
`;


// returns a connection so we can use db
export const createSettingsTable = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

export const createExerciseWeightsTable = `
  CREATE TABLE IF NOT EXISTS exercise_weights (
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    weight REAL NOT NULL,
    PRIMARY KEY (exercise_id, weight)
  );
  CREATE TABLE IF NOT EXISTS exercise_weight_increments (
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    start REAL NOT NULL,
    increment REAL NOT NULL CHECK (increment > 0),
    PRIMARY KEY (exercise_id, start)
  );
`;

// Keep the connection alive and share in-flight initialization between screens.
// static
let databaseReady: Promise<SQLite.SQLiteDatabase> | undefined;

export async function initializeDatabase() {
  return measureDb('initializeDatabase', () => {
    if (!databaseReady) {
      databaseReady = (async () => {
        // Own one native connection rather than rewrapping Expo's cached handle.
        const db = await SQLite.openDatabaseAsync('gymlog.db', { useNewConnection: true });
        await db.execAsync(`PRAGMA foreign_keys = ON;
          ${createRoutinesTable}
          ${createExercisesTable}
          ${createExerciseWeightsTable}
          ${createTrainingDaysTable}
          ${createDayExercisesTable}
          ${createLoggedSessionsTable}
          ${createLoggedExerciseTable}
          ${createLoggedSetTable}
          ${createExerciseAnnotationsTables}
          ${createSettingsTable}`);
        const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(logged_sets)');
        if (!columns.some(column => column.name === 'record_kind')) {
          await db.withTransactionAsync(async () => {
            await db.execAsync("ALTER TABLE logged_sets ADD COLUMN record_kind TEXT CHECK (record_kind IN ('pr', 'submaximal'))");
            // Preserve old rep records, distinguishing lighter records from the prior maximum weight.
            await db.execAsync(`UPDATE logged_sets SET record_kind = CASE WHEN weight < (
              SELECT MAX(older.weight) FROM logged_sets AS older
              JOIN logged_exercises AS old_ex ON old_ex.id = older.logged_exercise_id
              JOIN logged_exercises AS current_ex ON current_ex.id = logged_sets.logged_exercise_id
              JOIN logged_sessions AS old_session ON old_session.id = old_ex.logged_session_id
              JOIN logged_sessions AS current_session ON current_session.id = current_ex.logged_session_id
              WHERE (old_ex.exercise_id = current_ex.exercise_id OR
                  (old_ex.exercise_id IS NULL AND current_ex.exercise_id IS NULL AND old_ex.exercise_name = current_ex.exercise_name))
                AND (old_session.start_time < current_session.start_time OR
                  (old_session.start_time = current_session.start_time AND older.id < logged_sets.id))
                AND ${trackedSetCondition('older', 'old_ex')}
            ) THEN 'submaximal' ELSE 'pr' END WHERE rep_pr_improvement > 0`);
          });
        }
        return db;
      })().catch(error => {
        databaseReady = undefined;
        throw error;
      });
    }
    return databaseReady;
  });
}

export type ProgressionMode = 'hypertrophy' | 'fixed';

export async function getProgressionMode(db: SQLite.SQLiteDatabase): Promise<ProgressionMode> {
  return measureDb('getProgressionMode', async () => {
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'progression_mode'");
    return row?.value === 'fixed' ? 'fixed' : 'hypertrophy';
  });
}

export async function setProgressionMode(db: SQLite.SQLiteDatabase, mode: ProgressionMode): Promise<void> {
  return measureDb('setProgressionMode', async () => {
    if (mode !== 'fixed' && mode !== 'hypertrophy') throw new Error('Invalid progression mode');
    await db.runAsync(`INSERT INTO app_settings (key, value) VALUES ('progression_mode', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, mode);
  });
}

/** Reads the date preference, defaulting to day/month/year when unset. */
export async function getDateFormat(db: SQLite.SQLiteDatabase): Promise<DateFormat> {
  return measureDb('getDateFormat', async () => {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'date_format'"
    );
    return row && isDateFormat(row.value) ? row.value : DEFAULT_DATE_FORMAT;
  });
}

export async function setDateFormat(db: SQLite.SQLiteDatabase, format: DateFormat): Promise<void> {
  return measureDb('setDateFormat', async () => {
    if (!isDateFormat(format)) throw new Error('Invalid date format');
    await db.runAsync(
      `INSERT INTO app_settings (key, value) VALUES ('date_format', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`, format
    );
  });
}

// put new exercise into db
export async function insertExercise(db: SQLite.SQLiteDatabase, name: string, weights: number[] = [], increments: WeightIncrement[] = []) {
  return measureDb('insertExercise', async () => {
    const available = normalizeWeights(weights);
    const rules = normalizeIncrements(increments);
    let id = 0;
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync('INSERT INTO exercises (name) VALUES (?)', name);
      id = result.lastInsertRowId;
      for (const weight of available) {
        await db.runAsync('INSERT INTO exercise_weights (exercise_id, weight) VALUES (?, ?)', id, weight);
      }
      for (const rule of rules) {
        await db.runAsync('INSERT INTO exercise_weight_increments (exercise_id, start, increment) VALUES (?, ?, ?)', id, rule.start, rule.increment);
      }
    });
    return id;
  });
}

export async function listExerciseWeights(db: SQLite.SQLiteDatabase, exerciseId: number): Promise<number[]> {
  return measureDb('listExerciseWeights', async () => {
    const rows = await db.getAllAsync<{ weight: number }>(
      'SELECT weight FROM exercise_weights WHERE exercise_id = ? ORDER BY weight', exerciseId
    );
    return rows.map(row => row.weight);
  });
}

export async function setExerciseWeights(db: SQLite.SQLiteDatabase, exerciseId: number, weights: number[], increments: WeightIncrement[] = []): Promise<void> {
  return measureDb('setExerciseWeights', async () => {
    const available = normalizeWeights(weights);
    const rules = normalizeIncrements(increments);
    await db.withTransactionAsync(async () => {
      const exercise = await db.getFirstAsync<{ id: number }>('SELECT id FROM exercises WHERE id = ?', exerciseId);
      if (!exercise) throw new Error('Exercise not found');
      await db.runAsync('DELETE FROM exercise_weights WHERE exercise_id = ?', exerciseId);
      await db.runAsync('DELETE FROM exercise_weight_increments WHERE exercise_id = ?', exerciseId);
      for (const weight of available) {
        await db.runAsync('INSERT INTO exercise_weights (exercise_id, weight) VALUES (?, ?)', exerciseId, weight);
      }
      for (const rule of rules) {
        await db.runAsync('INSERT INTO exercise_weight_increments (exercise_id, start, increment) VALUES (?, ?, ?)', exerciseId, rule.start, rule.increment);
      }
    });
  });
}

export async function getExerciseWeightOptions(db: SQLite.SQLiteDatabase, exerciseId: number): Promise<WeightOptions> {
  return measureDb('getExerciseWeightOptions', async () => {
    const weights = await listExerciseWeights(db, exerciseId);
    const increments = await db.getAllAsync<WeightIncrement>(
      'SELECT start, increment FROM exercise_weight_increments WHERE exercise_id = ? ORDER BY start', exerciseId
    );
    return { weights, increments };
  });
}

// <Exercise> is the expected result shape
export async function listExercises(db: SQLite.SQLiteDatabase) {
  return measureDb('listExercises', async () => {
    return db.getAllAsync<Exercise>(
      'SELECT id, name FROM exercises ORDER BY name COLLATE NOCASE'
    );
  });
}

/** Returns each library exercise's highest logged weight and best reps at that weight. */
// gathers intermediates with relevant info first
export async function listExercisesWithRecords(db: SQLite.SQLiteDatabase): Promise<ExerciseWithRecord[]> {
  return measureDb('listExercisesWithRecords', () =>
    db.getAllAsync<ExerciseWithRecord>(
      `WITH performed_sets AS (
         SELECT logged_exercises.exercise_id, logged_sets.weight, logged_sets.reps
         FROM logged_sets
         JOIN logged_exercises ON logged_exercises.id = logged_sets.logged_exercise_id
         WHERE logged_exercises.exercise_id IS NOT NULL AND logged_sets.weight IS NOT NULL
           AND ${trackedSetCondition('logged_sets', 'logged_exercises')}
       ), heaviest_weights AS (
         SELECT exercise_id, MAX(weight) AS weight
         FROM performed_sets
         GROUP BY exercise_id
       )
       SELECT exercises.id, exercises.name,
              heaviest_weights.weight AS heaviestWeight,
              MAX(performed_sets.reps) AS repsAtHeaviestWeight
       FROM exercises
       LEFT JOIN heaviest_weights ON heaviest_weights.exercise_id = exercises.id
       LEFT JOIN performed_sets ON performed_sets.exercise_id = exercises.id
                              AND performed_sets.weight = heaviest_weights.weight
       GROUP BY exercises.id, exercises.name, heaviest_weights.weight
       ORDER BY exercises.name COLLATE NOCASE`
    )
  );
}

// go through day_exercises, get all exercises belonging to our training_day_id
// we join two tables by their ids which are the same! this is done first by sql, then we select
export async function listExercisesInTrainingDay(
  db: SQLite.SQLiteDatabase,
  trainingDayId: number
) {
  return measureDb('listExercisesInTrainingDay', async () => {
    return db.getAllAsync<TrainingDayExercise>(
      `SELECT exercises.id, exercises.name, day_exercises.prescribed_sets AS prescribedSets, 
         day_exercises.prescribed_weight_firstset AS prescribedWeightFirstSet,
         day_exercises.prescribed_reps_firstset AS prescribedRepsFirstSet
       FROM day_exercises
       JOIN EXERCISES
       ON exercises.id = day_exercises.exercise_id
       WHERE day_exercises.training_day_id = ?
       ORDER BY day_exercises.position`,
      trainingDayId
    );
  });
}

export async function listRoutines(db: SQLite.SQLiteDatabase): Promise<Routine[]> {
  return measureDb('listRoutines', () =>
    db.getAllAsync<Routine>(
      'SELECT id, name FROM routines ORDER BY name COLLATE NOCASE',
    ),
  );
}

export async function getStartScreenOrder(db: SQLite.SQLiteDatabase): Promise<string[]> {
  return measureDb('getStartScreenOrder', async () => {
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'start_screen_order'");
    try {
      const order: unknown = JSON.parse(row?.value ?? '[]');
      return Array.isArray(order) ? order.filter((key): key is string => typeof key === 'string') : [];
    } catch { return []; }
  });
}

export async function setStartScreenOrder(db: SQLite.SQLiteDatabase, order: string[]): Promise<void> {
  return measureDb('setStartScreenOrder', async () => {
    await db.runAsync(`INSERT INTO app_settings (key, value) VALUES ('start_screen_order', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, JSON.stringify(order));
  });
}

export async function reorderTrainingDayExercises(db: SQLite.SQLiteDatabase, dayId: number, exerciseIds: number[]): Promise<void> {
  return measureDb('reorderTrainingDayExercises', () => db.withTransactionAsync(async () => {
    const current = await db.getAllAsync<{ id: number }>('SELECT exercise_id AS id FROM day_exercises WHERE training_day_id = ?', dayId);
    if (exerciseIds.length !== current.length || new Set(exerciseIds).size !== exerciseIds.length
      || exerciseIds.some(id => !current.some(entry => entry.id === id))) throw new Error('Training day exercises changed; reopen the routine.');
    // Temporarily free unique positions before assigning the new order.
    await db.runAsync('UPDATE day_exercises SET position = -position - 1 WHERE training_day_id = ?', dayId);
    for (let position = 0; position < exerciseIds.length; position++) {
      await db.runAsync('UPDATE day_exercises SET position = ? WHERE training_day_id = ? AND exercise_id = ?', position, dayId, exerciseIds[position]);
    }
  }));
}

/** One setting represents zero or one active routine. */
export async function getActiveRoutineId(db: SQLite.SQLiteDatabase): Promise<number | null> {
  return measureDb('getActiveRoutineId', async () => {
    const row = await db.getFirstAsync<{ id: number }>(`SELECT routines.id FROM routines
      JOIN app_settings ON app_settings.key = 'active_routine_id' AND app_settings.value = CAST(routines.id AS TEXT)`);
    return row?.id ?? null;
  });
}

export async function setActiveRoutine(db: SQLite.SQLiteDatabase, routineId: number): Promise<void> {
  return measureDb('setActiveRoutine', () => db.withTransactionAsync(async () => {
    if (!await db.getFirstAsync('SELECT id FROM routines WHERE id = ?', routineId)) throw new Error('Routine not found');
    await db.runAsync(`INSERT INTO app_settings (key, value) VALUES ('active_routine_id', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(routineId));
  }));
}

export type ReusableTrainingDay = TrainingDay & { routineName: string };

export async function listReusableTrainingDays(db: SQLite.SQLiteDatabase): Promise<ReusableTrainingDay[]> {
  return measureDb('listReusableTrainingDays', () => db.getAllAsync<ReusableTrainingDay>(
    `SELECT days.id, days.name, days.position, days.routine_id AS routineId, routines.name AS routineName
     FROM training_days AS days JOIN routines ON routines.id = days.routine_id
     ORDER BY days.name COLLATE NOCASE, routines.name COLLATE NOCASE, days.id`
  ));
}

export async function updateExercisePrescription(db: SQLite.SQLiteDatabase, trainingDayId: number, exercise: DayExerciseDraft): Promise<void> {
  return measureDb('updateExercisePrescription', async () => {
    if (!Number.isInteger(exercise.prescribedSets) || exercise.prescribedSets < 1
      || !Number.isInteger(exercise.prescribedRepsFirstSet) || exercise.prescribedRepsFirstSet < 1
      || !Number.isFinite(exercise.prescribedWeightFirstSet)) throw new Error('Invalid exercise prescription');
    const result = await db.runAsync(`UPDATE day_exercises SET prescribed_sets = ?, prescribed_reps_firstset = ?, prescribed_weight_firstset = ?
      WHERE training_day_id = ? AND exercise_id = ?`, exercise.prescribedSets, exercise.prescribedRepsFirstSet,
      exercise.prescribedWeightFirstSet, trainingDayId, exercise.id);
    if (result.changes === 0) throw new Error('Training day exercise not found');
  });
}

export async function listTrainingDays(db: SQLite.SQLiteDatabase, routineId: number): Promise<TrainingDay[]> {
  return measureDb('listTrainingDays', () =>
    db.getAllAsync<TrainingDay>(
      `SELECT id, name, routine_id AS routineId, position 
       FROM training_days
       WHERE routine_id = ? 
       ORDER BY position`,
       routineId
    ),
  );
}


// from just the training day id, we get routine name and trainingDay name to log with the current time
// sql joins training_days and routines so we can get info from both
export async function createLoggedSession(db: SQLite.SQLiteDatabase, trainingDayId: number) {
  return measureDb('createLoggedSession', async () => {
    const day = await db.getFirstAsync<{
      training_day_name: string;
      routine_name: string;
    }>(
      `SELECT training_days.name AS training_day_name,
              routines.name AS routine_name
       FROM training_days
       JOIN routines ON routines.id = training_days.routine_id
       WHERE training_days.id = ?`,
      trainingDayId
    );

    if (!day) {
      throw new Error('Training day does not exist');
    }

    let sessionId = 0;
    const startTime = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'UPDATE logged_sessions SET finish_time = ? WHERE finish_time IS NULL', startTime
      );
      const result = await db.runAsync(
        `INSERT INTO logged_sessions
         (training_day_id, training_day_name, routine_name, start_time)
         VALUES (?, ?, ?, ?)`,
        trainingDayId, day.training_day_name, day.routine_name, startTime
      );
      sessionId = result.lastInsertRowId;
    });
    return sessionId;
  });
}




/** Finishes a session with a UTC timestamp, preserving the first finish time on retries. */
export async function finishLoggedSession(db: SQLite.SQLiteDatabase, sessionId: number): Promise<void> {
  return measureDb('finishLoggedSession', async () => {
    const result = await db.runAsync(
      `UPDATE logged_sessions
       SET finish_time = COALESCE(finish_time, ?)
       WHERE id = ?`,
      new Date().toISOString(),
      sessionId
    );
    if (result.changes === 0) throw new Error('Session not found');
  });
}

/** Loads finished workouts with at least one performed set, preserving snapshot names. */
export async function listFinishedWorkouts(db: SQLite.SQLiteDatabase): Promise<FinishedWorkout[]> {
  return measureDb('listFinishedWorkouts', async () => {
    const rows = await db.getAllAsync<{
      sessionId: number;
      routineId: number | null;
      trainingDayNumber: number | null;
      trainingDayName: string;
      routineName: string;
      finishTime: string;
      setId: number | null;
      loggedExerciseId: number;
      exerciseName: string;
      exerciseComment: string | null;
      tracked: number;
      setPosition: number;
      weight: number | null;
      reps: number;
      recordKind: 'pr' | 'submaximal' | null;
      repPrImprovement: number | null;
    }>(
      `SELECT logged_sessions.id AS sessionId,
              training_days.routine_id AS routineId, training_days.position + 1 AS trainingDayNumber,
              training_day_name AS trainingDayName, routine_name AS routineName,
              finish_time AS finishTime, logged_sets.id AS setId, logged_exercises.id AS loggedExerciseId,
              logged_sets.record_kind AS recordKind, logged_sets.rep_pr_improvement AS repPrImprovement,
              COALESCE(library.name, logged_exercises.exercise_name) AS exerciseName, order_number AS setPosition, weight, reps,
              notes.comment AS exerciseComment, (${trackedSetCondition('logged_sets', 'logged_exercises')}) AS tracked
       FROM logged_sessions
       LEFT JOIN training_days ON training_days.id = logged_sessions.training_day_id
       JOIN logged_exercises ON logged_exercises.logged_session_id = logged_sessions.id
       LEFT JOIN exercises AS library ON library.id = logged_exercises.exercise_id
       LEFT JOIN logged_sets ON logged_sets.logged_exercise_id = logged_exercises.id
       LEFT JOIN logged_exercise_annotations AS notes ON notes.logged_exercise_id = logged_exercises.id
       WHERE finish_time IS NOT NULL AND EXISTS (
         SELECT 1 FROM logged_exercises AS performed
         JOIN logged_sets AS completed ON completed.logged_exercise_id = performed.id
         WHERE performed.logged_session_id = logged_sessions.id
       )
       ORDER BY finish_time DESC, logged_sessions.id DESC, logged_exercises.position, order_number, logged_sets.id`
    );
    const workouts = new Map<number, FinishedWorkout>();
    for (const row of rows) {
      let workout = workouts.get(row.sessionId);
      if (!workout) {
        workout = {
          id: row.sessionId, routineId: row.routineId, trainingDayNumber: row.trainingDayNumber,
          trainingDayName: row.trainingDayName,
          routineName: row.routineName, finishTime: row.finishTime, sets: [],
        };
        workouts.set(row.sessionId, workout);
      }
      if (row.setId === null) {
        if (row.exerciseComment) (workout.exerciseNotes ??= []).push({ exerciseName: row.exerciseName, comment: row.exerciseComment });
        continue;
      }
      workout.sets.push({
        id: row.setId, loggedExerciseId: row.loggedExerciseId, exerciseName: row.exerciseName, setPosition: row.setPosition,
        weight: row.weight, reps: row.reps,
        recordKind: row.recordKind, repPrImprovement: row.repPrImprovement,
        ...(row.exerciseComment ? { exerciseComment: row.exerciseComment } : {}),
        ...(row.tracked === 0 ? { excludedFromTracking: true } : {}),
      });
    }
    return Array.from(workouts.values());
  });
}

/** Only the newest started session can resume; finishing it never revives older ones. */
export async function getResumableSession(db: SQLite.SQLiteDatabase): Promise<UnfinishedSession | null> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  return measureDb('getResumableSession', () => db.getFirstAsync<UnfinishedSession>(
    `SELECT id, training_day_name AS trainingDayName, routine_name AS routineName,
            start_time AS startTime
     FROM logged_sessions
     WHERE id = (SELECT id FROM logged_sessions WHERE start_time <= ?
                 ORDER BY start_time DESC, id DESC LIMIT 1)
       AND finish_time IS NULL AND start_time >= ?`,
    now.toISOString(), cutoff
  ));
}

export type LastSetWeight = { exerciseId: number; setPosition: number; weight: number };

/** Latest saved weight per exercise/set number, including sets from unfinished workouts. */
export async function listLastSetWeights(db: SQLite.SQLiteDatabase, currentSessionId: number): Promise<LastSetWeight[]> {
  return measureDb('listLastSetWeights', () => db.getAllAsync<LastSetWeight>(
    `WITH ranked AS (
       SELECT exercises.exercise_id AS exerciseId, sets.order_number AS setPosition, sets.weight,
              ROW_NUMBER() OVER (
                PARTITION BY exercises.exercise_id, sets.order_number
                ORDER BY sessions.start_time DESC, sessions.id DESC, sets.id DESC
              ) AS rank
       FROM logged_sets AS sets
       JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
       JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
       WHERE exercises.exercise_id IS NOT NULL AND sets.weight IS NOT NULL
         AND exercises.logged_session_id <> ?
     )
     SELECT exerciseId, setPosition, weight FROM ranked WHERE rank = 1`, currentSessionId
  ));
}

export type LastSetReps = LastSetWeight & { reps: number };

/** Rep PR at each weight and set position, omitting tracking exclusions and this session. */
export async function listSetRepRecords(db: SQLite.SQLiteDatabase, currentSessionId: number): Promise<LastSetReps[]> {
  return measureDb('listSetRepRecords', () => db.getAllAsync<LastSetReps>(
    `SELECT exercises.exercise_id AS exerciseId, sets.order_number AS setPosition, sets.weight, MAX(sets.reps) AS reps
     FROM logged_sets AS sets JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     WHERE exercises.exercise_id IS NOT NULL AND sets.weight IS NOT NULL
       AND exercises.logged_session_id <> ? AND ${trackedSetCondition('sets', 'exercises')}
     GROUP BY exercises.exercise_id, sets.order_number, sets.weight`, currentSessionId));
}

export type ExerciseHistorySet = {
  sessionId: number; finishTime: string; setPosition: number;
  weight: number | null; reps: number; comment: string; excluded: number;
};

/** Finished performance for one exercise; includes comments and excluded sets. */
export async function listExerciseHistory(db: SQLite.SQLiteDatabase, exerciseId: number, currentSessionId: number): Promise<ExerciseHistorySet[]> {
  return measureDb('listExerciseHistory', () => db.getAllAsync<ExerciseHistorySet>(
    `SELECT sessions.id AS sessionId, sessions.finish_time AS finishTime,
            sets.order_number AS setPosition, sets.weight, sets.reps,
            COALESCE(notes.comment, '') AS comment,
            NOT (${trackedSetCondition('sets', 'exercises')}) AS excluded
     FROM logged_sets AS sets
     JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
     LEFT JOIN logged_exercise_annotations AS notes ON notes.logged_exercise_id = exercises.id
     WHERE exercises.exercise_id = ? AND sessions.finish_time IS NOT NULL AND sessions.id <> ?
     ORDER BY sessions.finish_time DESC, sessions.id DESC, exercises.position, sets.order_number, sets.id`,
    exerciseId, currentSessionId));
}

/** Most recent reps at each exercise, weight and set position; defaults include excluded sets. */
export async function listLastSetReps(db: SQLite.SQLiteDatabase, currentSessionId: number): Promise<LastSetReps[]> {
  return measureDb('listLastSetReps', () => db.getAllAsync<LastSetReps>(
    `WITH ranked AS (
       SELECT exercises.exercise_id AS exerciseId, sets.order_number AS setPosition, sets.weight, sets.reps,
              ROW_NUMBER() OVER (
                PARTITION BY exercises.exercise_id, sets.order_number, sets.weight
                ORDER BY sessions.start_time DESC, sessions.id DESC, sets.id DESC
              ) AS rank
       FROM logged_sets AS sets
       JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
       JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
       WHERE exercises.exercise_id IS NOT NULL AND sets.weight IS NOT NULL
         AND exercises.logged_session_id <> ?
     )
     SELECT exerciseId, setPosition, weight, reps FROM ranked WHERE rank = 1`, currentSessionId
  ));
}

/** Loads performed sets in workout order, preferring current names with saved-name fallback. */
export async function listSavedSessionSets(db: SQLite.SQLiteDatabase, sessionId: number): Promise<SavedSessionSet[]> {
  return measureDb('listSavedSessionSets', () => db.getAllAsync<SavedSessionSet>(
    `SELECT logged_exercises.id AS loggedExerciseId, exercise_id AS exerciseId,
            COALESCE(library.name, logged_exercises.exercise_name) AS name, position,
            prescribed_sets AS prescribedSets,
            prescribed_weight_firstset AS prescribedWeightFirstSet,
            prescribed_reps_firstset AS prescribedRepsFirstSet,
            order_number AS setPosition, reps, weight, record_kind AS recordKind, rep_pr_improvement AS repPrImprovement
     FROM logged_exercises
     LEFT JOIN exercises AS library ON library.id = logged_exercises.exercise_id
     JOIN logged_sets ON logged_sets.logged_exercise_id = logged_exercises.id
     WHERE logged_session_id = ? ORDER BY position, order_number`, sessionId
  ));
}

export async function getLoggedSession(db: SQLite.SQLiteDatabase, sessionId: number) {
  return measureDb('getLoggedSession', async () => {
    return db.getFirstAsync<{ trainingDayId: number | null; trainingDayName: string; finishTime: string | null }>(
      `SELECT training_day_id AS trainingDayId, training_day_name AS trainingDayName, finish_time AS finishTime
       FROM logged_sessions WHERE id = ?`,
      sessionId
    );
  });
}

// withTransactionAsync: commit or roll back all transaction depending on success
export async function deleteExercise(
	db: SQLite.SQLiteDatabase,
	exerciseId: number
  ) {
  return measureDb('deleteExercise', async () => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
      'DELETE FROM day_exercises WHERE exercise_id = ?',
      exerciseId
      );
      await db.runAsync(
      'DELETE FROM exercises WHERE id = ?',
      exerciseId
      );
    });
  });
}

// delete links first, then from the training_days table
export async function deleteTrainingDay(
	db: SQLite.SQLiteDatabase,
	trainingDayId: number
  ) {
  return measureDb('deleteTrainingDay', async () => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'DELETE FROM day_exercises WHERE training_day_id = ?',
        trainingDayId
      );

      await db.runAsync(
      'DELETE FROM training_days WHERE id = ?',
      trainingDayId
      );
    });
  });
}

// save routine with its days and exercises
export async function insertRoutine(
  db: SQLite.SQLiteDatabase,
  name: string,
  days: TrainingDayDraft[]
) {
  return measureDb('insertRoutine', async () => {
    // error checking for days and exercises
    if (!name.trim() || days.length === 0) throw new Error('Routine requires a name and training days');
    for (const day of days) {
      if (!day.name.trim() || day.exercises.length === 0) throw new Error('Training day requires a name and exercises');
      for (const entry of day.exercises) {
        if (!Number.isInteger(entry.prescribedSets) || entry.prescribedSets < 1
          || !Number.isFinite(entry.prescribedWeightFirstSet)
          || !Number.isInteger(entry.prescribedRepsFirstSet) || entry.prescribedRepsFirstSet < 1) {
          throw new Error('Invalid exercise prescription');
        }
      }
    }
    let routineId = 0;
    await db.withTransactionAsync(async () => {
      const routine = await db.runAsync('INSERT INTO routines (name) VALUES (?)', name.trim());
      routineId = routine.lastInsertRowId;
      for (let dayPosition = 0; dayPosition < days.length; dayPosition++) {
        const day = days[dayPosition]; // 0 is first position
        const result = await db.runAsync(
          'INSERT INTO training_days (name, routine_id, position) VALUES (?, ?, ?)',
          day.name.trim(), routineId, dayPosition
        );
        for (let position = 0; position < day.exercises.length; position++) {
          const entry = day.exercises[position];
          await db.runAsync(
            `INSERT INTO day_exercises
             (training_day_id, exercise_id, position, prescribed_sets, prescribed_weight_firstset, prescribed_reps_firstset)
             VALUES (?, ?, ?, ?, ?, ?)`,
            result.lastInsertRowId, entry.id, position,
            entry.prescribedSets, entry.prescribedWeightFirstSet, entry.prescribedRepsFirstSet
          );
        }
      }
    });
    return routineId;
  });
}

/** Adds clearly labelled plotting fixtures once, without replacing user data. */
export async function seedDemoHistory(db: SQLite.SQLiteDatabase): Promise<boolean> {
  return measureDb('seedDemoHistory', async () => {
    let added = false;
    await db.withTransactionAsync(async () => {
      const marker = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM app_settings WHERE key = 'demo_history_v1'"
      );
      if (marker) {
        added = await enrichSquatDemoHistory(db);
        return;
      }
      const definitions = [
        { name: '[Demo] Bench press', baseWeight: 50, increment: 2.5 },
        { name: '[Demo] Squat', baseWeight: 70, increment: 5 },
        { name: '[Demo] Assisted dips', baseWeight: -30, increment: 5 },
      ];
      const routine = await db.runAsync('INSERT INTO routines (name) VALUES (?)', '[Demo] Progression');
      const day = await db.runAsync(
        'INSERT INTO training_days (name, routine_id, position) VALUES (?, ?, 0)',
        'Full body', routine.lastInsertRowId
      );
      const exerciseIds: number[] = [];
      for (let position = 0; position < definitions.length; position++) {
        const definition = definitions[position];
        const exercise = await db.runAsync('INSERT INTO exercises (name) VALUES (?)', definition.name);
        exerciseIds.push(exercise.lastInsertRowId);
        await db.runAsync(
          `INSERT INTO day_exercises
           (training_day_id, exercise_id, position, prescribed_sets, prescribed_weight_firstset, prescribed_reps_firstset)
           VALUES (?, ?, ?, 3, ?, 8)`,
          day.lastInsertRowId, exercise.lastInsertRowId, position, definition.baseWeight
        );
      }
      const previousBests = new Map<string, number>();
      for (let workout = 0; workout < 18; workout++) {
        const start = new Date();
        start.setDate(start.getDate() - ((17 - workout) * 3 + 1));
        start.setHours(18, 0, 0, 0);
        const finish = new Date(start.getTime() + 45 * 60 * 1000);
        const session = await db.runAsync(
          `INSERT INTO logged_sessions
           (training_day_id, start_time, finish_time, training_day_name, routine_name)
           VALUES (?, ?, ?, ?, ?)`,
          day.lastInsertRowId, start.toISOString(), finish.toISOString(), 'Full body', '[Demo] Progression'
        );
        for (let position = 0; position < definitions.length; position++) {
          const definition = definitions[position];
          const weight = definition.baseWeight + Math.floor(workout / 3) * definition.increment;
          const firstSetReps = 8 + workout % 3;
          const exercise = await db.runAsync(
            `INSERT INTO logged_exercises
             (exercise_id, logged_session_id, position, prescribed_sets,
              prescribed_weight_firstset, prescribed_reps_firstset, exercise_name)
             VALUES (?, ?, ?, 3, ?, ?, ?)`,
            exerciseIds[position], session.lastInsertRowId, position, weight, firstSetReps, definition.name
          );
          for (let set = 0; set < 3; set++) {
            const reps = firstSetReps - set;
            const key = `${exerciseIds[position]}:${weight}`;
            const previous = previousBests.get(key);
            const improvement = previous === undefined ? null : Math.max(0, reps - previous);
            await db.runAsync(
              `INSERT INTO logged_sets
               (logged_exercise_id, order_number, reps, weight, rep_pr_improvement, comment)
               VALUES (?, ?, ?, ?, ?, ?)`,
              exercise.lastInsertRowId, set, reps, weight, improvement, 'Demo data'
            );
            previousBests.set(key, Math.max(previous ?? reps, reps));
          }
        }
      }
      await db.runAsync("INSERT INTO app_settings (key, value) VALUES ('demo_history_v1', 'added')");
      await enrichSquatDemoHistory(db);
      added = true;
    });
    return added;
  });
}

/** Updates the plan atomically, retaining existing day IDs and logged snapshots. */
export async function updateRoutine(
  db: SQLite.SQLiteDatabase,
  routineId: number,
  name: string,
  days: TrainingDayDraft[]
): Promise<void> {
  return measureDb('updateRoutine', async () => {
    if (!name.trim() || days.length === 0) throw new Error('Routine requires a name and training days');
    for (const day of days) {
      if (!day.name.trim() || day.exercises.length === 0) throw new Error('Training day requires a name and exercises');
      for (const entry of day.exercises) {
        if (!Number.isInteger(entry.prescribedSets) || entry.prescribedSets < 1
          || !Number.isFinite(entry.prescribedWeightFirstSet)
          || !Number.isInteger(entry.prescribedRepsFirstSet) || entry.prescribedRepsFirstSet < 1) {
          throw new Error('Invalid exercise prescription');
        }
      }
    }
    await db.withTransactionAsync(async () => {
      const routine = await db.getFirstAsync<{ id: number }>('SELECT id FROM routines WHERE id = ?', routineId);
      if (!routine) throw new Error('Routine not found');
      const existingDays = await db.getAllAsync<{ id: number }>(
        'SELECT id FROM training_days WHERE routine_id = ?', routineId
      );
      const retainedIds = days.flatMap(day => day.id === undefined ? [] : [day.id]);
      if (new Set(retainedIds).size !== retainedIds.length
        || retainedIds.some(id => !existingDays.some(day => day.id === id))) {
        throw new Error('Invalid training day IDs');
      }
      await db.runAsync('UPDATE routines SET name = ? WHERE id = ?', name.trim(), routineId);
      for (const day of existingDays) {
        if (!retainedIds.includes(day.id)) {
          await db.runAsync('DELETE FROM day_exercises WHERE training_day_id = ?', day.id);
          await db.runAsync('DELETE FROM training_days WHERE id = ?', day.id);
        }
      }
      // Free the non-negative positions before assigning the draft's new order.
      await db.runAsync('UPDATE training_days SET position = -position - 1 WHERE routine_id = ?', routineId);
      for (let position = 0; position < days.length; position++) {
        const day = days[position];
        let dayId = day.id;
        if (dayId === undefined) {
          const result = await db.runAsync(
            'INSERT INTO training_days (name, routine_id, position) VALUES (?, ?, ?)',
            day.name.trim(), routineId, position
          );
          dayId = result.lastInsertRowId;
        } else {
          await db.runAsync('UPDATE training_days SET name = ?, position = ? WHERE id = ?', day.name.trim(), position, dayId);
          await db.runAsync('DELETE FROM day_exercises WHERE training_day_id = ?', dayId);
        }
        for (let exercisePosition = 0; exercisePosition < day.exercises.length; exercisePosition++) {
          const entry = day.exercises[exercisePosition];
          await db.runAsync(
            `INSERT INTO day_exercises
             (training_day_id, exercise_id, position, prescribed_sets, prescribed_weight_firstset, prescribed_reps_firstset)
             VALUES (?, ?, ?, ?, ?, ?)`,
            dayId, entry.id, exercisePosition, entry.prescribedSets,
            entry.prescribedWeightFirstSet, entry.prescribedRepsFirstSet
          );
        }
      }
    });
  });
}

export async function deleteRoutine(db: SQLite.SQLiteDatabase, routineId: number) {
  return measureDb('deleteRoutine', async () => {
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `DELETE FROM day_exercises WHERE training_day_id IN
         (SELECT id FROM training_days WHERE routine_id = ?)`, routineId
      );
      await db.runAsync('DELETE FROM training_days WHERE routine_id = ?', routineId);
      await db.runAsync("DELETE FROM app_settings WHERE key = 'active_routine_id' AND value = ?", String(routineId));
      await db.runAsync('DELETE FROM routines WHERE id = ?', routineId);
    });
  });
}

async function measureDb<T>(
    label: string,
    operation: () => Promise<T>, // operation returns a promise where the eventual result is of type T
): Promise<T> { // measureDb will also return a promise containing T result type
    const start = performance.now();

    try {
        return await operation();
    } finally {
        console.log(
            `[DB] ${label}: ${(performance.now() - start).toFixed(1)} ms`,
        );
    }
}

/** Individual performed sets from finished workouts, in chronological order. */
export type ExerciseProgressPoint = {
  id: number;
  setPosition: number;
  sessionId: number;
  finishTime: string;
  weight: number;
  reps: number;
};

export async function listExerciseProgress(db: SQLite.SQLiteDatabase, exerciseId: number): Promise<ExerciseProgressPoint[]> {
  return measureDb('listExerciseProgress', () => db.getAllAsync<ExerciseProgressPoint>(
    `SELECT sets.id, sets.order_number AS setPosition, sessions.id AS sessionId,
            sessions.finish_time AS finishTime, sets.weight, sets.reps
     FROM logged_sets AS sets
     JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
     WHERE exercises.exercise_id = ? AND sessions.finish_time IS NOT NULL AND sets.weight IS NOT NULL
       AND ${trackedSetCondition('sets', 'exercises')}
     ORDER BY sessions.finish_time, sessions.id, exercises.position, sets.order_number, sets.id`,
    exerciseId
  ));
}


/** One-time upgrade of demo squat sets; all three sets are working sets. Called inside the seed transaction. */
async function enrichSquatDemoHistory(db: SQLite.SQLiteDatabase): Promise<boolean> {
  const marker = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = 'demo_squat_v2'");
  if (marker) return false;
  const rows = await db.getAllAsync<{ id: number; sessionId: number; setPosition: number }>(
    `SELECT sets.id, sessions.id AS sessionId, sets.order_number AS setPosition
     FROM logged_sets AS sets
     JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
     WHERE exercises.exercise_name = '[Demo] Squat' AND exercises.exercise_id IS NOT NULL
       AND sessions.routine_name = '[Demo] Progression'
       AND sets.comment = 'Demo data' AND sets.order_number BETWEEN 0 AND 2
     ORDER BY sessions.finish_time, sessions.id, sets.order_number`
  );
  if (rows.length === 0) return false;
  const sessions = [...new Set(rows.map(row => row.sessionId))];
  const heavyWeights = [80, 82.5, 80, 85, 87.5, 85, 90, 87.5, 92.5, 90, 95, 92.5, 97.5, 95, 100, 97.5, 102.5, 100];
  for (const row of rows) {
    const workout = sessions.indexOf(row.sessionId);
    const heavy = heavyWeights[workout % heavyWeights.length];
    const weights = workout % 2 === 0 ? [heavy, heavy - 5, heavy - 10] : [heavy - 5, heavy, heavy - 10];
    const reps = [6 + workout % 4, 5 + (workout * 2) % 5, 8 + workout % 3];
    await db.runAsync('UPDATE logged_sets SET weight = ?, reps = ? WHERE id = ?',
      weights[row.setPosition], reps[row.setPosition], row.id);
  }
  // Recompute this demo exercise's PR metadata after changing its history.
  const records = await db.getAllAsync<{ id: number; exerciseId: number | null; weight: number | null; reps: number }>(
    `SELECT sets.id, exercises.exercise_id AS exerciseId, sets.weight, sets.reps
     FROM logged_sets AS sets
     JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
     WHERE exercises.exercise_name = '[Demo] Squat'
     ORDER BY sessions.start_time, sessions.id, sets.order_number, sets.id`
  );
  const bests = new Map<string, number>();
  for (const record of records) {
    const key = `${record.exerciseId}:${record.weight}`;
    const previous = bests.get(key);
    const improvement = previous === undefined ? null : Math.max(0, record.reps - previous);
    await db.runAsync('UPDATE logged_sets SET rep_pr_improvement = ? WHERE id = ?', improvement, record.id);
    bests.set(key, Math.max(previous ?? record.reps, record.reps));
  }
  await db.runAsync("INSERT INTO app_settings (key, value) VALUES ('demo_squat_v2', 'added')");
  return true;
}

type EditableLogExercise = { exerciseId: number | null; name: string; loggedExerciseId: number; setPosition: number };

async function findEditableSet(db: SQLite.SQLiteDatabase, sessionId: number, setId: number): Promise<EditableLogExercise> {
  const exercise = await db.getFirstAsync<EditableLogExercise>(
    `SELECT exercises.exercise_id AS exerciseId, exercises.exercise_name AS name,
            exercises.id AS loggedExerciseId, sets.order_number AS setPosition
     FROM logged_sets AS sets JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
     WHERE sets.id = ? AND sessions.id = ? AND sessions.finish_time IS NOT NULL`, setId, sessionId);
  if (!exercise) throw new Error('Finished set not found');
  return exercise;
}

async function rebuildExerciseRecords(db: SQLite.SQLiteDatabase, exercise: EditableLogExercise): Promise<void> {
  const history = await db.getAllAsync<{ id: number; weight: number | null; reps: number; tracked: number }>(
    `SELECT sets.id, sets.weight, sets.reps, (${trackedSetCondition('sets', 'exercises')}) AS tracked
     FROM logged_sets AS sets JOIN logged_exercises AS exercises ON exercises.id = sets.logged_exercise_id
     JOIN logged_sessions AS sessions ON sessions.id = exercises.logged_session_id
     WHERE exercises.exercise_id = ? OR (? IS NULL AND exercises.exercise_id IS NULL AND exercises.exercise_name = ?)
     ORDER BY sessions.start_time, sessions.id, exercises.position, sets.order_number, sets.id`,
    exercise.exerciseId, exercise.exerciseId, exercise.name);
  const bests = new Map<number, number>();
  let maxWeight: number | null = null;
  for (const set of history) {
    const previous = set.weight === null ? undefined : bests.get(set.weight);
    const improvement = !set.tracked || set.weight === null || previous === undefined ? null : Math.max(0, set.reps - previous);
    const record = set.tracked && set.weight !== null && maxWeight !== null
      ? set.weight > maxWeight ? 'pr' : (improvement ?? 0) > 0 ? (set.weight === maxWeight ? 'pr' : 'submaximal') : null
      : null;
    await db.runAsync('UPDATE logged_sets SET rep_pr_improvement = ?, record_kind = ? WHERE id = ?', improvement, record, set.id);
    if (set.tracked && set.weight !== null) {
      bests.set(set.weight, Math.max(previous ?? set.reps, set.reps));
      maxWeight = Math.max(maxWeight ?? set.weight, set.weight);
    }
  }
}

/** Corrects a finished set and rebuilds that exercise's historical PR markers atomically. */
export async function updateLoggedSet(db: SQLite.SQLiteDatabase, sessionId: number, setId: number, weight: number | null, reps: number): Promise<void> {
  return measureDb('updateLoggedSet', async () => {
    if ((weight !== null && !Number.isFinite(weight)) || !Number.isInteger(reps) || reps < 1) throw new Error('Invalid set');
    await db.withTransactionAsync(async () => {
      const exercise = await findEditableSet(db, sessionId, setId);
      await db.runAsync('UPDATE logged_sets SET weight = ?, reps = ? WHERE id = ?', weight, reps, setId);
      await rebuildExerciseRecords(db, exercise);
    });
  });
}

/** Appends a performed set to an existing exercise in a finished workout. */
export async function addLoggedSet(db: SQLite.SQLiteDatabase, sessionId: number, sourceSetId: number, weight: number | null, reps: number): Promise<number> {
  return measureDb('addLoggedSet', async () => {
    if ((weight !== null && !Number.isFinite(weight)) || !Number.isInteger(reps) || reps < 1) throw new Error('Invalid set');
    let id = 0;
    await db.withTransactionAsync(async () => {
      const exercise = await findEditableSet(db, sessionId, sourceSetId);
      const position = await db.getFirstAsync<{ next: number }>(
        'SELECT COALESCE(MAX(order_number), -1) + 1 AS next FROM logged_sets WHERE logged_exercise_id = ?', exercise.loggedExerciseId);
      id = (await db.runAsync('INSERT INTO logged_sets (logged_exercise_id, order_number, weight, reps) VALUES (?, ?, ?, ?)',
        exercise.loggedExerciseId, position!.next, weight, reps)).lastInsertRowId;
      await rebuildExerciseRecords(db, exercise);
    });
    return id;
  });
}

/** Keeps surviving set positions stable so tracking exclusions stay with their sets. */
export async function deleteLoggedSet(db: SQLite.SQLiteDatabase, sessionId: number, setId: number): Promise<void> {
  return measureDb('deleteLoggedSet', () => db.withTransactionAsync(async () => {
    const exercise = await findEditableSet(db, sessionId, setId);
    await db.runAsync('DELETE FROM logged_sets WHERE id = ?', setId);
    await db.runAsync('DELETE FROM logged_set_exclusions WHERE logged_exercise_id = ? AND set_position = ?',
      exercise.loggedExerciseId, exercise.setPosition);
    await rebuildExerciseRecords(db, exercise);
  }));
}

/** Deletes one finished workout and its performed sets, leaving plans and library intact. */
export async function deleteFinishedWorkout(db: SQLite.SQLiteDatabase, sessionId: number): Promise<void> {
  return measureDb('deleteFinishedWorkout', () => db.withTransactionAsync(async () => {
    const session = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM logged_sessions WHERE id = ? AND finish_time IS NOT NULL', sessionId
    );
    if (!session) throw new Error('Finished workout not found');
    await db.runAsync(
      `DELETE FROM logged_sets WHERE logged_exercise_id IN
       (SELECT id FROM logged_exercises WHERE logged_session_id = ?)`, sessionId
    );
    await db.runAsync('DELETE FROM logged_exercises WHERE logged_session_id = ?', sessionId);
    await db.runAsync('DELETE FROM logged_sessions WHERE id = ?', sessionId);
  }));
}

/** Persistent equipment/setup notes, separate from comments on a logged workout. */
export async function listExerciseNotes(db: SQLite.SQLiteDatabase): Promise<{ exerciseId: number; note: string }[]> {
  return measureDb('listExerciseNotes', () => db.getAllAsync('SELECT exercise_id AS exerciseId, note FROM exercise_notes'));
}

export async function saveExerciseNote(db: SQLite.SQLiteDatabase, exerciseId: number, note: string): Promise<void> {
  return measureDb('saveExerciseNote', async () => {
    await db.runAsync(`INSERT INTO exercise_notes (exercise_id, note) VALUES (?, ?)
      ON CONFLICT(exercise_id) DO UPDATE SET note = excluded.note`, exerciseId, note.trim());
  });
}
