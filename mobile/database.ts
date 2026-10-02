import * as SQLite from 'expo-sqlite';

export const createExercisesTable = `
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );
`;

export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('gymlog.db');
  await db.execAsync(createExercisesTable);
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
  return db.getAllAsync<{ id: number; name: string }>(
    'SELECT id, name FROM exercises ORDER BY name COLLATE NOCASE'
  );
}

