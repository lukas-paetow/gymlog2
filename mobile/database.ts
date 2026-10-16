import * as SQLite from 'expo-sqlite';
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
  sets: {
    id: number;
    exerciseName: string;
    setPosition: number;
    weight: number | null;
    reps: number;
  }[];
};

export type SavedSessionSet = {
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
    rep_pr_improvement INTEGER CHECK (rep_pr_improvement >= 0),
    weight REAL,
    comment TEXT,
    FOREIGN KEY (logged_exercise_id) REFERENCES logged_exercises(id)
  );
`;

// Positions come from the active workout, not the training-day template.
// Assign the exercise position on its first saved set and retain it afterward.
export async function saveCompletedSet(
    db: SQLite.SQLiteDatabase,
    sessionId: number,
    exercise: TrainingDayExercise,
    workoutExercisePosition: number,
    setPosition: number,
    reps: number,
    weight: number,
): Promise<number> {
    return measureDb('saveCompletedSet', async () => {
        if (!Number.isInteger(reps) || reps < 1
            || !Number.isFinite(weight) 
            || !Number.isInteger(workoutExercisePosition) || workoutExercisePosition < 0
            || !Number.isInteger(setPosition) || setPosition < 0) {
            throw new Error('Invalid set values');
        }

        let setId = 0;

        await db.withTransactionAsync(async () => {
            const session = await db.getFirstAsync<{
                finish_time: string | null;
            }>(
                'SELECT finish_time FROM logged_sessions WHERE id = ?',
                sessionId,
            );

            if (!session) throw new Error('Session not found');
            if (session.finish_time !== null) {
                throw new Error('Session already finished');
            }

            // check if exercise already is logged once
            let loggedExercise = await db.getFirstAsync<{ id: number }>( // expected type
                `SELECT id FROM logged_exercises
                 WHERE logged_session_id = ? AND exercise_id = ?`,
                sessionId,
                exercise.id,
            );

            if (!loggedExercise) {
                const result = await db.runAsync(
                    `INSERT INTO logged_exercises (
                        exercise_id, logged_session_id, position,
                        exercise_name, prescribed_sets,
                        prescribed_weight_firstset, prescribed_reps_firstset
                     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    exercise.id,
                    sessionId,
                    workoutExercisePosition,
                    exercise.name,
                    exercise.prescribedSets,
                    exercise.prescribedWeightFirstSet,
                    exercise.prescribedRepsFirstSet,
                );

                loggedExercise = { id: result.lastInsertRowId };
            }

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

            const record = await db.getFirstAsync<{ maxReps: number | null }>(
                `SELECT MAX(logged_sets.reps) AS maxReps
                 FROM logged_sets
                 JOIN logged_exercises
                   ON logged_exercises.id = logged_sets.logged_exercise_id
                 WHERE logged_exercises.exercise_id = ?
                   AND logged_sets.weight = ?`,
                exercise.id,
                weight,
            );

            const previousMax = record?.maxReps ?? null; // optional chaining - only if record exists, else null
            const improvement = previousMax === null
                ? null
                : Math.max(0, reps - previousMax);

            const result = await db.runAsync(
                `INSERT INTO logged_sets (
                    logged_exercise_id, order_number,
                    reps, weight, rep_pr_improvement
                 ) VALUES (?, ?, ?, ?, ?)`,
                loggedExercise.id,
                setPosition,
                reps,
                weight,
                improvement,
            );

            setId = result.lastInsertRowId;
        });

        return setId;
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
          ${createTrainingDaysTable}
          ${createDayExercisesTable}
          ${createLoggedSessionsTable}
          ${createLoggedExerciseTable}
          ${createLoggedSetTable}
          ${createSettingsTable}`);
        return db;
      })().catch(error => {
        databaseReady = undefined;
        throw error;
      });
    }
    return databaseReady;
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
export async function insertExercise(
  db: SQLite.SQLiteDatabase,
  name: string
) {
  return measureDb('insertExercise', async () => {
    const result = await db.runAsync(
      'INSERT INTO exercises (name) VALUES (?)',
      name
    );
    return result.lastInsertRowId;
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

    const result = await db.runAsync(
      `INSERT INTO logged_sessions
       (training_day_id, training_day_name, routine_name, start_time)
       VALUES (?, ?, ?, ?)`,
      trainingDayId,
      day.training_day_name,
      day.routine_name,
      new Date().toISOString()
    );

    return result.lastInsertRowId;
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
      setId: number;
      exerciseName: string;
      setPosition: number;
      weight: number | null;
      reps: number;
    }>(
      `SELECT logged_sessions.id AS sessionId,
              training_days.routine_id AS routineId, training_days.position + 1 AS trainingDayNumber,
              training_day_name AS trainingDayName, routine_name AS routineName,
              finish_time AS finishTime, logged_sets.id AS setId,
              exercise_name AS exerciseName, order_number AS setPosition, weight, reps
       FROM logged_sessions
       LEFT JOIN training_days ON training_days.id = logged_sessions.training_day_id
       JOIN logged_exercises ON logged_exercises.logged_session_id = logged_sessions.id
       JOIN logged_sets ON logged_sets.logged_exercise_id = logged_exercises.id
       WHERE finish_time IS NOT NULL
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
      workout.sets.push({
        id: row.setId, exerciseName: row.exerciseName, setPosition: row.setPosition,
        weight: row.weight, reps: row.reps,
      });
    }
    return Array.from(workouts.values());
  });
}

/** Offers only the most recent unfinished workout started within six hours. */
export async function getResumableSession(db: SQLite.SQLiteDatabase): Promise<UnfinishedSession | null> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  return measureDb('getResumableSession', () => db.getFirstAsync<UnfinishedSession>(
    `SELECT id, training_day_name AS trainingDayName, routine_name AS routineName,
            start_time AS startTime
     FROM logged_sessions
     WHERE finish_time IS NULL AND start_time >= ? AND start_time <= ?
     ORDER BY start_time DESC, id DESC LIMIT 1`,
    cutoff, now.toISOString()
  ));
}

/** Loads performed sets with their original exercise snapshots and workout order. */
export async function listSavedSessionSets(db: SQLite.SQLiteDatabase, sessionId: number): Promise<SavedSessionSet[]> {
  return measureDb('listSavedSessionSets', () => db.getAllAsync<SavedSessionSet>(
    `SELECT logged_exercises.id AS loggedExerciseId, exercise_id AS exerciseId,
            exercise_name AS name, position,
            prescribed_sets AS prescribedSets,
            prescribed_weight_firstset AS prescribedWeightFirstSet,
            prescribed_reps_firstset AS prescribedRepsFirstSet,
            order_number AS setPosition, reps, weight
     FROM logged_exercises
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
