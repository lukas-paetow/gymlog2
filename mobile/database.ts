import * as SQLite from 'expo-sqlite';

// TypeScript types
export type Exercise = {
  id: number;
  name: string;
};

export type WorkoutTemplate = {
  id: number;
  name: string;
};

// SQL strings we use later
// primary key: unique
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
// linking table
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

// returns a connection so we can use db
export async function initializeDatabase() {
  const db = await SQLite.openDatabaseAsync('gymlog.db');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(createExercisesTable);
  await db.execAsync(createWorkoutTemplateTable);
  await db.execAsync(createTemplateExercisesTable);
  return db; // a connection
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

// <Exercise> is the expected result shape
export async function listExercises(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<Exercise>(
    'SELECT id, name FROM exercises ORDER BY name COLLATE NOCASE'
  );}

export async function listWorkoutTemplates(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<WorkoutTemplate>(
    'SELECT id, name FROM workout_templates ORDER BY name COLLATE NOCASE'
  );}

// delete links first
export async function deleteWorkoutTemplate(
	db: SQLite.SQLiteDatabase,
	templateId: number
  ) {
	await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM template_exercises WHERE template_id = ?', 
      templateId
    );

    await db.runAsync(
    'DELETE FROM workout_templates WHERE id = ?',
    templateId
    );
  });
}

export async function insertWorkoutTemplate(
  db: SQLite.SQLiteDatabase,
  name: string, // template id?
  exerciseIds: number[]
){ 
  await db.withTransactionAsync(async () => 
  { const result = await db.runAsync( 
    'INSERT INTO workout_templates (name) VALUES (?)',
    name
  );
  const templateId = result.lastInsertRowId;
  for (let position = 0; position < exerciseIds.length; position++) {
    await db.runAsync(
      `INSERT INTO template_exercises
        (template_id, exercise_id, position)
       VALUES (?, ?, ?)`,
      templateId,
      exerciseIds[position],
      position
    );
  }
});
}
