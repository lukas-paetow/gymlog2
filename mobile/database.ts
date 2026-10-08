import * as SQLite from 'expo-sqlite';

// TypeScript types
export type Exercise = {
  id: number;
  name: string;
};

// an intersection type
export type TrainingDayExercise = Exercise & {
  prescribed_sets: number;
  prescribed_weight_firstset: number;
};

// contains its own info on where it fits in with routine
export type TrainingDay = {
  id: number;
  name: string;
  position: number;
  routine_id: number;
};

export type Routine = {
  id: number;
  name: string;
};

// Shared because the screen builds these drafts and the database saves them.
export type DayExerciseDraft = {
  exerciseId: number;
  prescribedSets: number;
  prescribedWeightFirstSet: number;
};

export type TrainingDayDraft = {
  name: string;
  exercises: DayExerciseDraft[];
};

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
    PRIMARY KEY (training_day_id, exercise_id),
    UNIQUE (training_day_id, position),
    FOREIGN KEY (training_day_id) REFERENCES training_days(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );
`;

// returns a connection so we can use db
export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('gymlog.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(createRoutinesTable);
  await db.execAsync(createExercisesTable);
  await db.execAsync(createTrainingDaysTable);
  await db.execAsync(createDayExercisesTable);
  return db; // a connection
}

// put new exercise into db
export async function insertExercise(
  db: SQLite.SQLiteDatabase,
  name: string
) {
  const result = await db.runAsync(
    'INSERT INTO exercises (name) VALUES (?)',
    name
  );
  return result.lastInsertRowId;
}

// <Exercise> is the expected result shape
export async function listExercises(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Exercise>(
    'SELECT id, name FROM exercises ORDER BY name COLLATE NOCASE'
  );}

// go through day_exercises, get all exercises belonging to our training_day_id
// we join two tables by their ids which are the same! this is done first by sql, then we select
export async function listExercisesInTrainingDay(
  db: SQLite.SQLiteDatabase,
  trainingDayId: number
) {
  return db.getAllAsync<TrainingDayExercise>(
    `SELECT exercises.id, exercises.name, day_exercises.prescribed_sets, day_exercises.prescribed_weight_firstset
     FROM day_exercises
     JOIN EXERCISES
     ON exercises.id = day_exercises.exercise_id
     WHERE day_exercises.training_day_id = ?
     ORDER BY day_exercises.position`,
    trainingDayId
  );
}

export async function listRoutines(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Routine>(
    'SELECT id, name FROM routines ORDER BY name COLLATE NOCASE'
  );
}

export async function listTrainingDays(db: SQLite.SQLiteDatabase, routineId: number) {
  return db.getAllAsync<TrainingDay>(
    `SELECT id, name, routine_id, position FROM training_days
     WHERE routine_id = ? ORDER BY position`,
    routineId
  );
}

// withTransactionAsync: commit or roll back all transaction depending on success
export async function deleteExercise(
	db: SQLite.SQLiteDatabase,
	exerciseId: number
  ) {
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
}

// delete links first, then from the training_days table
export async function deleteTrainingDay(
	db: SQLite.SQLiteDatabase,
	trainingDayId: number
  ) {
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
}

// Save the parent, days, and prescriptions as one operation.
export async function insertRoutine(
  db: SQLite.SQLiteDatabase,
  name: string,
  days: TrainingDayDraft[]
) {
  if (!name.trim() || days.length === 0) throw new Error('Routine requires a name and training days');
  for (const day of days) {
    if (!day.name.trim() || day.exercises.length === 0) throw new Error('Training day requires a name and exercises');
    for (const entry of day.exercises) {
      if (!Number.isInteger(entry.prescribedSets) || entry.prescribedSets < 1
        || !Number.isFinite(entry.prescribedWeightFirstSet)) {
        throw new Error('Invalid exercise prescription');
      }
    }
  }
  let routineId = 0;
  await db.withTransactionAsync(async () => {
    const routine = await db.runAsync('INSERT INTO routines (name) VALUES (?)', name.trim());
    routineId = routine.lastInsertRowId;
    for (let dayPosition = 0; dayPosition < days.length; dayPosition++) {
      const day = days[dayPosition];
      const result = await db.runAsync(
        'INSERT INTO training_days (name, routine_id, position) VALUES (?, ?, ?)',
        day.name.trim(), routineId, dayPosition
      );
      for (let position = 0; position < day.exercises.length; position++) {
        const entry = day.exercises[position];
        await db.runAsync(
          `INSERT INTO day_exercises
           (training_day_id, exercise_id, position, prescribed_sets, prescribed_weight_firstset)
           VALUES (?, ?, ?, ?, ?)`,
          result.lastInsertRowId, entry.exerciseId, position,
          entry.prescribedSets, entry.prescribedWeightFirstSet
        );
      }
    }
  });
  return routineId;
}

export async function deleteRoutine(db: SQLite.SQLiteDatabase, routineId: number) {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM day_exercises WHERE training_day_id IN
       (SELECT id FROM training_days WHERE routine_id = ?)`, routineId
    );
    await db.runAsync('DELETE FROM training_days WHERE routine_id = ?', routineId);
    await db.runAsync('DELETE FROM routines WHERE id = ?', routineId);
  });
}
