import * as SQLite from 'expo-sqlite';

export type Exercise = {
  id: number;
  name: string;
};

export type WorkoutTemplate = {
  id: number;
  name: string;
};

export const createWorkoutTemplateTable = `
  CREATE TABLE IF NOT EXISTS workout_templates (
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

// foreign key: required to exist elsewhere
export const createTemplateExercisesTable = `
  CREATE TABLE IF NOT EXISTS template_exercises (
    template_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (template_id, exercise_id),
    UNIQUE (template_id, position),
    FOREIGN KEY (template_id) REFERENCES workout_templates(id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id)
  );
`;

export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('gymlog.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(createExercisesTable);
  await db.execAsync(createWorkoutTemplateTable);
  await db.execAsync(createTemplateExercisesTable);
  return db;
}

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

export async function listExercises(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Exercise>(
    'SELECT id, name FROM exercises ORDER BY name COLLATE NOCASE'
  );}

export async function insertWorkoutTemplate(
  db: SQLite.SQLiteDatabase,
  name: string,
  exerciseIds: number[]
) {
	// something
}
