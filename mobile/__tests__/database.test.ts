import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabaseAsync } from 'expo-sqlite';
import * as database from '../database';
import type { DayExerciseDraft, TrainingDayDraft, TrainingDayExercise } from '../database';
import type { DateFormat } from '../dateFormat';
import { createTestDatabase } from './support/sqlite';


// create mock opener and connection
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
const open = jest.mocked(openDatabaseAsync);
let fixture: ReturnType<typeof createTestDatabase>;
const connections: ReturnType<typeof createTestDatabase>[] = [];

function connect(path?: string) {
  fixture = createTestDatabase(path);
  connections.push(fixture);
  open.mockResolvedValue(fixture.db);
  return fixture;
}

// create data for tests
const prescription = (id: number, overrides: Partial<DayExerciseDraft> = {}): DayExerciseDraft => ({
  id, prescribedSets: 3, prescribedRepsFirstSet: 8, prescribedWeightFirstSet: -20, ...overrides,
});
async function plan() {
  const exerciseId = await database.insertExercise(fixture.db, 'Dips');
  const days: TrainingDayDraft[] = [{ name: 'Day', exercises: [prescription(exerciseId)] }];
  const routineId = await database.insertRoutine(fixture.db, 'Routine', days);
  const [day] = await database.listTrainingDays(fixture.db, routineId);
  const [exercise] = await database.listExercisesInTrainingDay(fixture.db, day.id);
  const sessionId = await database.createLoggedSession(fixture.db, day.id);
  return { routineId, day, exercise, sessionId };
}

// count database rows for checking
function count(table: string) {
  return (fixture.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

// watch functions
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  connect();
});
// cleanup
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('initialization and current baseline', () => {
  test('initializes the frozen current baseline without losing saved rows', async () => {
    fixture.connection.exec(readFileSync(join(__dirname, 'fixtures/baseline-2026-10-15.sql'), 'utf8'));
    fixture.connection.exec(`
      INSERT INTO routines VALUES (1, 'Baseline routine');
      INSERT INTO exercises VALUES (1, 'Assisted dips');
      INSERT INTO training_days VALUES (1, 'Baseline day', 1, 0);
      INSERT INTO day_exercises VALUES (1, 1, 0, 3, -20, 10);
      INSERT INTO logged_sessions VALUES (1, 1, '2026-10-01T10:00:00.000Z', NULL, 'Baseline day', 'Baseline routine');
      INSERT INTO logged_exercises (id, exercise_id, logged_session_id, position, prescribed_sets, exercise_name)
      VALUES (1, 1, 1, 0, 3, 'Assisted dips');
      INSERT INTO logged_sets (logged_exercise_id, order_number, reps, weight) VALUES (1, 0, 10, -20);
    `);
    await database.initializeDatabase();
    expect((await database.listExercisesInTrainingDay(fixture.db, 1))[0]).toMatchObject({
      prescribedWeightFirstSet: -20, prescribedRepsFirstSet: 10,
    });
    expect((await database.listSavedSessionSets(fixture.db, 1))[0]).toMatchObject({ reps: 10, weight: -20 });
    expect(fixture.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  test('creates a fresh database with foreign keys and accepts negative prescriptions', async () => {
    expect(fixture.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
    await database.initializeDatabase();
    expect(fixture.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name)).toEqual([
      'app_settings', 'day_exercises', 'exercises', 'logged_exercises',
      'logged_sessions', 'logged_sets', 'routines', 'training_days',
    ]);
    expect(count('routines')).toBe(0);
    expect(fixture.connection.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    const { exercise } = await plan();
    expect(exercise.prescribedWeightFirstSet).toBe(-20);
  });

  test('repeated initialization preserves all existing rows and settings', async () => {
    await database.initializeDatabase();
    const { exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.setDateFormat(fixture.db, 'YYYY-MM-DD');
    const tables = ['routines', 'exercises', 'training_days', 'day_exercises',
      'logged_sessions', 'logged_exercises', 'logged_sets', 'app_settings'];
    const snapshot = () => Object.fromEntries(tables.map(table => [
      table, fixture.connection.prepare(`SELECT * FROM ${table}`).all(),
    ]));
    const before = snapshot();
    await database.initializeDatabase();
    expect(snapshot()).toEqual(before);
    expect(fixture.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

describe('plans and deletion', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('lists exercise names alphabetically without case sensitivity', async () => {
    await database.insertExercise(fixture.db, 'zebra');
    await database.insertExercise(fixture.db, 'Alpha');
    expect((await database.listExercises(fixture.db)).map(row => row.name)).toEqual(['Alpha', 'zebra']);
    expect(await database.listTrainingDays(fixture.db, 999)).toEqual([]);
  });

  test('creates an ordered plan, updates prescriptions and retains day/session identities', async () => {
    const { routineId, day, exercise, sessionId } = await plan();
    await database.updateRoutine(fixture.db, routineId, ' Updated ', [
      { name: 'New day', exercises: [prescription(exercise.id)] },
      { id: day.id, name: 'Renamed', exercises: [prescription(exercise.id, { prescribedRepsFirstSet: 10 })] },
    ]);
    const days = await database.listTrainingDays(fixture.db, routineId);
    expect(days.map(row => row.name)).toEqual(['New day', 'Renamed']);
    expect(days[1].id).toBe(day.id);
    expect((await database.listRoutines(fixture.db))[0].name).toBe('Updated');
    expect(await database.getLoggedSession(fixture.db, sessionId)).toMatchObject({ trainingDayId: day.id, trainingDayName: 'Day' });
    await database.updateRoutine(fixture.db, routineId, 'Reordered', [
      { id: day.id, name: 'First now', exercises: [prescription(exercise.id)] },
      { id: days[0].id, name: 'Second now', exercises: [prescription(exercise.id)] },
    ]);
    expect((await database.listTrainingDays(fixture.db, routineId))[0].id).toBe(day.id);
    await database.updateRoutine(fixture.db, routineId, 'Removed day', [
      { id: days[0].id, name: 'Remaining', exercises: [prescription(exercise.id)] },
    ]);
    expect((await database.getLoggedSession(fixture.db, sessionId))?.trainingDayId).toBeNull();
  });

  test.each(['exercise', 'day', 'routine'] as const)('deleting %s preserves logged sets and snapshot names', async kind => {
    const { routineId, day, exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    if (kind === 'exercise') await database.deleteExercise(fixture.db, exercise.id);
    if (kind === 'day') await database.deleteTrainingDay(fixture.db, day.id);
    if (kind === 'routine') await database.deleteRoutine(fixture.db, routineId);
    expect(count('logged_sets')).toBe(1);
    expect(count('day_exercises')).toBe(0);
    const [saved] = await database.listSavedSessionSets(fixture.db, sessionId);
    expect(saved.name).toBe('Dips');
    expect(saved.exerciseId).toBe(kind === 'exercise' ? null : exercise.id);
    expect((await database.getLoggedSession(fixture.db, sessionId))?.trainingDayId).toBe(kind === 'exercise' ? day.id : null);
  });

  test.each([
    ['', [{ name: 'Day', exercises: [prescription(1)] }]],
    ['Routine', []], ['Routine', [{ name: '', exercises: [prescription(1)] }]],
    ['Routine', [{ name: 'Day', exercises: [] }]],
    ...[{ prescribedSets: 0 }, { prescribedSets: 1.5 }, { prescribedRepsFirstSet: 0 }, { prescribedRepsFirstSet: 1.5 }, { prescribedWeightFirstSet: Infinity }]
      .map(overrides => ['Routine', [{ name: 'Day', exercises: [prescription(1, overrides)] }]]),
  ] as [string, TrainingDayDraft[]][])('rejects invalid plan %s %j', async (name, days) => {
    await expect(database.insertRoutine(fixture.db, name, days)).rejects.toThrow();
    await expect(database.updateRoutine(fixture.db, 1, name, days)).rejects.toThrow();
    expect(count('routines')).toBe(0);
  });

  test('invalid references roll back edits and reject foreign/duplicate day IDs', async () => {
    const { routineId, day, exercise } = await plan();
    await expect(database.updateRoutine(fixture.db, routineId, 'Broken', [{ id: day.id, name: 'Broken', exercises: [prescription(999)] }])).rejects.toThrow();
    expect((await database.listRoutines(fixture.db))[0].name).toBe('Routine');
    expect((await database.listTrainingDays(fixture.db, routineId))[0].name).toBe('Day');
    await expect(database.updateRoutine(fixture.db, routineId, 'Wrong', [{ id: 999, name: 'Day', exercises: [prescription(exercise.id)] }])).rejects.toThrow('Invalid training day IDs');
    await expect(database.updateRoutine(fixture.db, routineId, 'Duplicate', [0, 1].map(() => ({ id: day.id, name: 'Day', exercises: [prescription(exercise.id)] })))).rejects.toThrow('Invalid training day IDs');
    await expect(database.updateRoutine(fixture.db, 999, 'Missing', [{ name: 'Day', exercises: [prescription(exercise.id)] }])).rejects.toThrow('Routine not found');
    await expect(database.insertRoutine(fixture.db, 'Bad insert', [{ name: 'Day', exercises: [prescription(999)] }])).rejects.toThrow();
    expect(count('routines')).toBe(1);
  });
});

describe('logging, records, and history', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('creates the exercise only with a saved set, preserves order and ignores a retry', async () => {
    const { exercise, sessionId } = await plan();
    expect(count('logged_exercises')).toBe(0);
    const id = await database.saveCompletedSet(fixture.db, sessionId, exercise, 4, 0, 8, -20);
    expect(await database.saveCompletedSet(fixture.db, sessionId, exercise, 4, 0, 8, -20)).toBe(id);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 4, 1, 6, 0);
    expect(count('logged_exercises')).toBe(1);
    expect(count('logged_sets')).toBe(2);
    expect((await database.listSavedSessionSets(fixture.db, sessionId)).map(row => [row.position, row.setPosition, row.weight])).toEqual([[4, 0, -20], [4, 1, 0]]);
  });

  test('same-weight PR baseline, improvement, ties, and different weights', async () => {
    const { exercise, sessionId } = await plan();
    for (const [position, reps, weight] of [[0, 8, -20], [1, 10, -20], [2, 10, -20], [3, 5, 0]]) {
      await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, position, reps, weight);
    }
    expect(fixture.connection.prepare('SELECT rep_pr_improvement FROM logged_sets ORDER BY id').all().map(row => row.rep_pr_improvement)).toEqual([null, 2, 0, null]);
    const unused = await database.insertExercise(fixture.db, 'Unused');
    const records = await database.listExercisesWithRecords(fixture.db);
    expect(records.find(row => row.id === exercise.id)).toMatchObject({ heaviestWeight: 0, repsAtHeaviestWeight: 5 });
    expect(records.find(row => row.id === unused)).toMatchObject({ heaviestWeight: null, repsAtHeaviestWeight: null });
  });

  test.each([
    [0, 0, 0, 20], [0, 0, 1.5, 20], [0, 0, 8, NaN], [-1, 0, 8, 20],
    [1.5, 0, 8, 20], [0, -1, 8, 20], [0, 1.5, 8, 20],
  ])('rejects invalid set arguments %j', async (position, setPosition, reps, weight) => {
    const { exercise, sessionId } = await plan();
    await expect(database.saveCompletedSet(fixture.db, sessionId, exercise, position, setPosition, reps, weight)).rejects.toThrow('Invalid set values');
    expect(count('logged_sets')).toBe(0);
  });

  test('failed set insert rolls back its exercise; errors and timing propagate', async () => {
    const { exercise, sessionId } = await plan();
    const run = fixture.adapter.runAsync.bind(fixture.adapter);
    jest.spyOn(fixture.adapter, 'runAsync').mockImplementation(async (sql, ...args) => {
      if (sql.includes('INSERT INTO logged_sets')) throw new Error('write failed');
      return run(sql, ...args);
    });
    await expect(database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, 20)).rejects.toThrow('write failed');
    expect(count('logged_exercises')).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/\[DB\] saveCompletedSet: .* ms/));
  });

  test('finishes idempotently, rejects missing/finished sessions, and shows only finished history', async () => {
    const { exercise, sessionId } = await plan();
    await expect(database.saveCompletedSet(fixture.db, 999, exercise, 0, 0, 8, 20)).rejects.toThrow('Session not found');
    await expect(database.createLoggedSession(fixture.db, 999)).rejects.toThrow('Training day does not exist');
    expect(await database.getLoggedSession(fixture.db, 999)).toBeNull();
    expect(await database.listFinishedWorkouts(fixture.db)).toEqual([]);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.finishLoggedSession(fixture.db, sessionId);
    const first = (await database.getLoggedSession(fixture.db, sessionId))?.finishTime;
    await database.finishLoggedSession(fixture.db, sessionId);
    expect((await database.getLoggedSession(fixture.db, sessionId))?.finishTime).toBe(first);
    await expect(database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 8, 20)).rejects.toThrow('Session already finished');
    await expect(database.finishLoggedSession(fixture.db, 999)).rejects.toThrow('Session not found');
    expect((await database.listFinishedWorkouts(fixture.db))[0].sets[0]).toMatchObject({ exerciseName: 'Dips', reps: 8, weight: -20 });
  });

  test('history excludes empty sessions and preserves snapshot names and set order', async () => {
    const { exercise, day, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 3, 1, 6, -10);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 3, 0, 8, -10);
    await database.finishLoggedSession(fixture.db, sessionId);
    const empty = await database.createLoggedSession(fixture.db, day.id);
    await database.finishLoggedSession(fixture.db, empty);
    await database.deleteExercise(fixture.db, exercise.id);
    const history = await database.listFinishedWorkouts(fixture.db);
    expect(history.map(row => row.id)).toEqual([sessionId]);
    expect(history[0].sets.map(row => row.setPosition)).toEqual([0, 1]);
    expect(history[0].sets[0].exerciseName).toBe('Dips');
  });

  test('finishing without performed sets closes the session without creating history', async () => {
    const { sessionId } = await plan();
    await database.finishLoggedSession(fixture.db, sessionId);
    expect((await database.getLoggedSession(fixture.db, sessionId))?.finishTime).not.toBeNull();
    expect(await database.getResumableSession(fixture.db)).toBeNull();
    expect(await database.listFinishedWorkouts(fixture.db)).toEqual([]);
    expect(count('logged_exercises')).toBe(0);
    expect(count('logged_sets')).toBe(0);
  });

  test('resume returns only the latest eligible unfinished session within six hours', async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] });
    jest.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    expect(await database.getResumableSession(fixture.db)).toBeNull();
    const insert = fixture.connection.prepare("INSERT INTO logged_sessions (start_time, finish_time, training_day_name, routine_name) VALUES (?, ?, 'Day', 'Routine')");
    insert.run('2026-01-01T05:59:59.999Z', null);
    insert.run('2026-01-01T06:00:00.000Z', null);
    insert.run('2026-01-01T11:00:00.000Z', null);
    insert.run('2026-01-01T11:30:00.000Z', 'finished');
    insert.run('2026-01-01T13:00:00.000Z', null);
    expect((await database.getResumableSession(fixture.db))?.id).toBe(3);
    fixture.connection.exec('DELETE FROM logged_sessions WHERE id = 3');
    expect((await database.getResumableSession(fixture.db))?.id).toBe(2);
    fixture.connection.exec('DELETE FROM logged_sessions WHERE id = 2');
    expect(await database.getResumableSession(fixture.db)).toBeNull();
  });
});

describe('settings and demo fixtures', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('date settings default, validate, upsert, and survive closing/reopening', async () => {
    expect(await database.getDateFormat(fixture.db)).toBe('DD/MM/YYYY');
    await fixture.db.runAsync("INSERT INTO app_settings VALUES ('date_format', 'bad')");
    expect(await database.getDateFormat(fixture.db)).toBe('DD/MM/YYYY');
    await expect(database.setDateFormat(fixture.db, 'bad' as DateFormat)).rejects.toThrow('Invalid date format');
    const directory = mkdtempSync(join(tmpdir(), 'gymlog-tests-'));
    try {
      const path = join(directory, 'test.db');
      const first = connect(path);
      await database.initializeDatabase();
      await database.setDateFormat(first.db, 'MM/DD/YYYY');
      await database.setDateFormat(first.db, 'system');
      first.close(); connections.splice(connections.indexOf(first), 1);
      connect(path);
      await database.initializeDatabase();
      expect(await database.getDateFormat(fixture.db)).toBe('system');
      expect(count('app_settings')).toBe(1);
    } finally {
      const last = connections.pop(); last?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('demo history is isolated, dated, varied, and safe to seed twice', async () => {
    await database.insertExercise(fixture.db, 'Real exercise');
    expect(await database.seedDemoHistory(fixture.db)).toBe(true);
    expect(count('logged_sessions')).toBe(18);
    expect(count('logged_exercises')).toBe(54);
    expect(count('logged_sets')).toBe(162);
    expect(count('exercises')).toBe(4);
    expect(await database.seedDemoHistory(fixture.db)).toBe(false);
    expect(count('logged_sets')).toBe(162);
    expect((await database.listExercisesWithRecords(fixture.db)).find(row => row.name === '[Demo] Assisted dips')).toMatchObject({ heaviestWeight: -5, repsAtHeaviestWeight: 10 });
    expect((await database.listFinishedWorkouts(fixture.db))).toHaveLength(18);
    expect(fixture.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  test('a failed seed rolls back its data and marker', async () => {
    const run = fixture.adapter.runAsync.bind(fixture.adapter);
    jest.spyOn(fixture.adapter, 'runAsync').mockImplementation(async (sql, ...args) => {
      if (sql.includes('INSERT INTO logged_sets')) throw new Error('seed failed');
      return run(sql, ...args);
    });
    await expect(database.seedDemoHistory(fixture.db)).rejects.toThrow('seed failed');
    expect(count('routines')).toBe(0);
    expect(count('exercises')).toBe(0);
    expect(count('logged_sessions')).toBe(0);
    expect(count('app_settings')).toBe(0);
  });
});
