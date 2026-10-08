import * as SQLite from 'expo-sqlite';

// TypeScript types
export type Exercise = {
  id: number;
  name: string;
};

export type RoutineExercise = Exercise & {
  prescribed_sets: number;
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
    prescribed_sets INTEGER NOT NULL DEFAULT 2 CHECK (prescribed_sets >= 1),
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
  await migrateDatabase(db);
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

// go through template_exercises, get all exercises belonging to our template_id
// we join two tables by their ids which are the same! this is done first by sql, then we select
export async function listExercisesInRoutine(
  db: SQLite.SQLiteDatabase,
  templateId: number
) {
  return db.getAllAsync<RoutineExercise>(
    `SELECT exercises.id, exercises.name, template_exercises.prescribed_sets
     FROM template_exercises
     JOIN EXERCISES
     ON exercises.id = template_exercises.exercise_id
     WHERE template_exercises.template_id = ?
     ORDER BY template_exercises.position`,
    templateId
  );
}

export async function listWorkoutTemplates(db: SQLite.SQLiteDatabase) {
  return db.getAllAsync<WorkoutTemplate>(
    'SELECT id, name FROM workout_templates ORDER BY name COLLATE NOCASE'
  );}

// withTransactionAsync: commit or roll back all transaction depending on success
export async function deleteExercise(
	db: SQLite.SQLiteDatabase,
	exerciseId: number
  ) {
	await db.withTransactionAsync(async () => {
    await db.runAsync(
    'DELETE FROM template_exercises WHERE exercise_id = ?',
    exerciseId
    );
    await db.runAsync(
    'DELETE FROM exercises WHERE id = ?',
    exerciseId
    );
  });
}

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

// very first version had no prescribed sets
async function migrateDatabase(db: SQLite.SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    const version = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );

    if (version?.user_version === 0) {
      const columns = await db.getAllAsync<{ name: string }>(
        'PRAGMA table_info(template_exercises)'
      );

      const hasSets = columns.some(
        (column) => column.name === 'prescribed_sets'
      );

      if (!hasSets) {
        await db.execAsync(`
          ALTER TABLE template_exercises
          ADD COLUMN prescribed_sets INTEGER NOT NULL DEFAULT 2
          CHECK (prescribed_sets >= 1);
        `);
      }

      await db.execAsync('PRAGMA user_version = 1');
    }
  });
}
