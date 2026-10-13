import * as SQLite from 'expo-sqlite';

// TypeScript types
export type Exercise = {
  id: number;
  name: string;
};

export type ExerciseWithRecord = Exercise & {
  heaviestWeight: number | null;
  repsAtHeaviestWeight: number | null;
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
export async function initializeDatabase() {
  return measureDb('initializeDatabase', async () => {
    const db = await SQLite.openDatabaseAsync('gymlog.db');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync(createRoutinesTable);
    await db.execAsync(createExercisesTable);
    await db.execAsync(createTrainingDaysTable);
    await db.execAsync(createDayExercisesTable);
    await db.execAsync(createLoggedSessionsTable);
    await db.execAsync(createLoggedExerciseTable);
    await db.execAsync(createLoggedSetTable);
    await migrateFirstSetReps(db);
    return db; // a connection
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

export async function getLoggedSession(db: SQLite.SQLiteDatabase, sessionId: number) {
  return measureDb('getLoggedSession', async () => {
    return db.getFirstAsync<{ trainingDayId: number | null; trainingDayName: string }>(
      `SELECT training_day_id AS trainingDayId, training_day_name AS trainingDayName
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


// Share an in-progress migration if multiple screens initialize at once.
let repsMigrationInProgress: Promise<void> | null = null;

async function migrateFirstSetReps(db: SQLite.SQLiteDatabase): Promise<void> {
  if (repsMigrationInProgress) return repsMigrationInProgress;

  repsMigrationInProgress = measureDb('migrateFirstSetReps', async () => {
    await db.withTransactionAsync(async () => {
      const dayColumns = await db.getAllAsync<{ name: string }>(
        'PRAGMA table_info(day_exercises)'
      );
      if (!dayColumns.some(column => column.name === 'prescribed_reps_firstset')) {
        await db.execAsync(
          `ALTER TABLE day_exercises ADD COLUMN prescribed_reps_firstset
           INTEGER NOT NULL DEFAULT 8 CHECK (prescribed_reps_firstset >= 1)`
        );
      }

      const loggedColumns = await db.getAllAsync<{ name: string }>(
        'PRAGMA table_info(logged_exercises)'
      );
      if (!loggedColumns.some(column => column.name === 'prescribed_reps_firstset')) {
        await db.execAsync(
          `ALTER TABLE logged_exercises ADD COLUMN prescribed_reps_firstset
           INTEGER NOT NULL DEFAULT 8 CHECK (prescribed_reps_firstset >= 1)`
        );
      }
    });
  });

  try {
    await repsMigrationInProgress;
  } finally {
    repsMigrationInProgress = null;
  }
}

