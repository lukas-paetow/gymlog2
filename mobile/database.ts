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
  CREATE TABLE IF NOT EXISTS exercises (
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

export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('gymlog.db');
  await db.execAsync(createExercisesTable);
  await db.execAsync(createWorkoutTemplateTable);
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
  );
}
