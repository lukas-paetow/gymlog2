import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
let database: typeof import('../database');
import type { DayExerciseDraft, TrainingDayDraft, TrainingDayExercise } from '../database';
import type { DateFormat } from '../dateFormat';
import { createTestDatabase } from './support/sqlite';


// create mock opener and connection
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
let open: jest.MockedFunction<typeof import('expo-sqlite').openDatabaseAsync>;
let fixture: ReturnType<typeof createTestDatabase>;
const connections: ReturnType<typeof createTestDatabase>[] = [];

function connect(path?: string) {
  // A fresh module represents a fresh app process and owns one connection.
  jest.resetModules();
  database = require('../database');
  open = jest.mocked(require('expo-sqlite').openDatabaseAsync);
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
      'app_settings', 'day_exercises', 'exercise_notes', 'exercise_weight_increments', 'exercise_weights', 'exercises', 'logged_exercise_annotations', 'logged_exercises',
      'logged_sessions', 'logged_set_exclusions', 'logged_sets', 'routines', 'training_days',
    ]);
    expect(count('routines')).toBe(0);
    expect(fixture.connection.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
    const { exercise } = await plan();
    expect(exercise.prescribedWeightFirstSet).toBe(-20);
  });

  test('concurrent initialization and later navigation reuse a single ready connection', async () => {
    const exec = jest.spyOn(fixture.adapter, 'execAsync');
    const connections = await Promise.all([database.initializeDatabase(), database.initializeDatabase(), database.initializeDatabase()]);
    expect(connections).toEqual([fixture.db, fixture.db, fixture.db]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('gymlog.db', { useNewConnection: true });
    expect(exec).toHaveBeenCalledTimes(1);
    await database.listExerciseProgress(fixture.db, 1);
    await database.initializeDatabase();
    await database.listExercisesWithRecords(fixture.db);
    expect(open).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  test.each(['open', 'schema'] as const)('initialization retries after a failed %s', async phase => {
    const failure = new Error('Native failure');
    if (phase === 'open') open.mockRejectedValueOnce(failure);
    else jest.spyOn(fixture.adapter, 'execAsync').mockRejectedValueOnce(failure);
    const failures = await Promise.allSettled([database.initializeDatabase(), database.initializeDatabase()]);
    expect(failures).toEqual([{ status: 'rejected', reason: failure }, { status: 'rejected', reason: failure }]);
    expect(await database.initializeDatabase()).toBe(fixture.db);
    expect(open).toHaveBeenCalledTimes(2);
    expect(await database.listExercises(fixture.db)).toEqual([]);
  });

  test('repeated initialization preserves all existing rows and settings', async () => {
    await database.initializeDatabase();
    const { exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.setDateFormat(fixture.db, 'MM/DD/YYYY');
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
    expect(await database.saveCompletedSet(fixture.db, sessionId, exercise, 4, 0, 8, -20)).toEqual(id);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 4, 1, 6, 0);
    expect(count('logged_exercises')).toBe(1);
    expect(count('logged_sets')).toBe(2);
    expect((await database.listSavedSessionSets(fixture.db, sessionId)).map(row => [row.position, row.setPosition, row.weight])).toEqual([[4, 0, -20], [4, 1, 0]]);
  });

  test('same-weight PR baseline, improvement, ties, and different weights', async () => {
    const { exercise, sessionId } = await plan();
    const results: import('../database').SavedSetResult[] = [];
    for (const [position, reps, weight] of [[0, 8, -20], [1, 10, -20], [2, 10, -20], [3, 5, 0]]) {
      results.push(await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, position, reps, weight));
    }
    expect(results.map(result => result.isPersonalRecord)).toEqual([false, true, false, true]);
    expect(await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 10, -20)).toEqual({ id: results[1].id, isPersonalRecord: false });
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
    expect(await database.getResumableSession(fixture.db)).toBeNull();
    fixture.connection.exec('DELETE FROM logged_sessions WHERE id = 4');
    expect((await database.getResumableSession(fixture.db))?.id).toBe(3);
    fixture.connection.exec('DELETE FROM logged_sessions WHERE id = 3');
    expect((await database.getResumableSession(fixture.db))?.id).toBe(2);
    fixture.connection.exec('DELETE FROM logged_sessions WHERE id = 2');
    expect(await database.getResumableSession(fixture.db)).toBeNull();
  });
});

test('editing finished sets rebuilds chronological PRs without changing routine targets', async () => {
  await database.initializeDatabase();
  const { sessionId, day, exercise } = await plan();
  const first = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
  const nextSession = await database.createLoggedSession(fixture.db, day.id);
  const next = await database.saveCompletedSet(fixture.db, nextSession, exercise, 0, 0, 10, -20);
  await database.finishLoggedSession(fixture.db, nextSession);
  const targets = await database.listExercisesInTrainingDay(fixture.db, day.id);
  await database.updateLoggedSet(fixture.db, sessionId, first.id, -20, 12);
  const history = await database.listFinishedWorkouts(fixture.db);
  expect(history.flatMap(w => w.sets).find(s => s.id === first.id)).toMatchObject({ reps: 12, weight: -20, repPrImprovement: null });
  expect(history.flatMap(w => w.sets).find(s => s.id === next.id)).toMatchObject({ reps: 10, repPrImprovement: 0 });
  expect(await database.listExercisesInTrainingDay(fixture.db, day.id)).toEqual(targets);
  await database.updateLoggedSet(fixture.db, sessionId, first.id, -17.5, 12);
  expect((await database.listFinishedWorkouts(fixture.db)).flatMap(w => w.sets).find(s => s.id === next.id)?.repPrImprovement).toBeNull();
  const active = await database.createLoggedSession(fixture.db, day.id);
  const activeSet = await database.saveCompletedSet(fixture.db, active, exercise, 0, 0, 8, -10);
  await expect(database.updateLoggedSet(fixture.db, active, activeSet.id, -5, 9)).rejects.toThrow('Finished set not found');
  await expect(database.updateLoggedSet(fixture.db, nextSession, first.id, -5, 9)).rejects.toThrow('Finished set not found');
  await expect(database.updateLoggedSet(fixture.db, sessionId, first.id, NaN, 9)).rejects.toThrow('Invalid set');
  await expect(database.updateLoggedSet(fixture.db, sessionId, first.id, -5, 0)).rejects.toThrow('Invalid set');
});

test('a failed PR rebuild rolls the historical set correction back', async () => {
  await database.initializeDatabase();
  const { sessionId, exercise } = await plan();
  const set = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
  await database.finishLoggedSession(fixture.db, sessionId);
  const original = fixture.adapter.runAsync.bind(fixture.adapter);
  jest.spyOn(fixture.adapter, 'runAsync').mockImplementation(async (sql, ...parameters) => {
    if (sql.startsWith('UPDATE logged_sets SET rep_pr_improvement')) throw new Error('disk failure');
    return original(sql, ...parameters);
  });
  await expect(database.updateLoggedSet(fixture.db, sessionId, set.id, -15, 12)).rejects.toThrow('disk failure');
  expect(fixture.connection.prepare('SELECT weight, reps FROM logged_sets WHERE id = ?').get(set.id)).toEqual({ weight: -20, reps: 8 });
});

test('finished logs can append and delete sets while keeping exclusions and PR markers consistent', async () => {
  await database.initializeDatabase();
  const { sessionId, exercise } = await plan();
  const first = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
  await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: 'Note', excludeAll: false, excludedPositions: [2] });
  await database.finishLoggedSession(fixture.db, sessionId);
  const added = await database.addLoggedSet(fixture.db, sessionId, first.id, -20, 12);
  expect((await database.listFinishedWorkouts(fixture.db))[0].sets.find(set => set.id === added))
    .toMatchObject({ weight: -20, reps: 12, setPosition: 1, repPrImprovement: 4 });
  await database.deleteLoggedSet(fixture.db, sessionId, first.id);
  expect((await database.listFinishedWorkouts(fixture.db))[0].sets[0]).toMatchObject({ id: added, setPosition: 1, repPrImprovement: null });
  const third = await database.addLoggedSet(fixture.db, sessionId, added, -20, 14);
  await database.deleteLoggedSet(fixture.db, sessionId, third);
  const replacement = await database.addLoggedSet(fixture.db, sessionId, added, -20, 15);
  expect((await database.listFinishedWorkouts(fixture.db))[0].sets.find(set => set.id === replacement))
    .toMatchObject({ setPosition: 2, repPrImprovement: 3 });
  expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0].excludedPositions).toEqual([]);
  await expect(database.addLoggedSet(fixture.db, sessionId, added, -20, 0)).rejects.toThrow('Invalid set');
  await expect(database.deleteLoggedSet(fixture.db, sessionId + 100, added)).rejects.toThrow('Finished set not found');
  await database.deleteLoggedSet(fixture.db, sessionId, added);
  await database.deleteLoggedSet(fixture.db, sessionId, replacement);
  expect(await database.listFinishedWorkouts(fixture.db)).toEqual([]);
});

test('rep defaults use per-position PRs rather than recent lower performances or excluded sets', async () => {
  await database.initializeDatabase();
  const { exercise, sessionId, day } = await plan();
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 14, -20);
  const newer = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, newer, exercise, 0, 0, 8, -20);
  await database.saveCompletedSet(fixture.db, newer, exercise, 0, 1, 7, -20);
  const excluded = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, excluded, exercise, 0, 0, 99, -20);
  await database.saveExerciseAnnotation(fixture.db, excluded, exercise, { comment: '', excludeAll: true, excludedPositions: [] });
  const active = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, active, exercise, 0, 0, 100, -20);
  const records = await database.listSetRepRecords(fixture.db, active);
  expect(records).toEqual([
    { exerciseId: exercise.id, setPosition: 0, weight: -20, reps: 14 },
    { exerciseId: exercise.id, setPosition: 1, weight: -20, reps: 7 },
  ]);
});

test('exercise history preserves excluded performance and comments while omitting the active session', async () => {
  await database.initializeDatabase();
  const { exercise, sessionId, day } = await plan();
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 12, -20);
  await database.saveExerciseAnnotation(fixture.db, sessionId, exercise,
    { comment: 'Shoulder sore', excludeAll: false, excludedPositions: [0] });
  await database.finishLoggedSession(fixture.db, sessionId);
  const active = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, active, exercise, 0, 0, 15, -15);
  const history = await database.listExerciseHistory(fixture.db, exercise.id, active);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ sessionId, setPosition: 0, reps: 12, weight: -20, comment: 'Shoulder sore', excluded: 1 });
  expect(await database.listExerciseHistory(fixture.db, exercise.id + 100, active)).toEqual([]);
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

describe('exercise progress', () => {
  beforeEach(async () => { await database.initializeDatabase(); });

  test('returns individual sets and set positions from finished sessions, isolates exercises, and sorts by date', async () => {
    const { day, exercise, sessionId } = await plan();
    expect(await database.listExerciseProgress(fixture.db, exercise.id)).toEqual([]);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 10, -20);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 2, 6, 0);
    // Exclude unfinished sessions even when they contain completed sets.
    expect(await database.listExerciseProgress(fixture.db, exercise.id)).toEqual([]);
    await database.finishLoggedSession(fixture.db, sessionId);
    fixture.connection.prepare('UPDATE logged_sessions SET finish_time = ? WHERE id = ?').run('2026-10-12T12:00:00.000Z', sessionId);
    const earlier = await database.createLoggedSession(fixture.db, day.id);
    await database.saveCompletedSet(fixture.db, earlier, exercise, 0, 0, 7, -20);
    await database.finishLoggedSession(fixture.db, earlier);
    fixture.connection.prepare('UPDATE logged_sessions SET finish_time = ? WHERE id = ?').run('2026-10-01T12:00:00.000Z', earlier);
    // Unknown weights cannot be selected for this metric.
    fixture.connection.prepare('INSERT INTO logged_sets (logged_exercise_id, order_number, reps, weight) SELECT id, 3, 100, NULL FROM logged_exercises WHERE logged_session_id = ?').run(earlier);
    expect(await database.listExerciseProgress(fixture.db, exercise.id)).toMatchObject([
      { setPosition: 0, sessionId: earlier, finishTime: '2026-10-01T12:00:00.000Z', weight: -20, reps: 7 },
      { setPosition: 0, sessionId, finishTime: '2026-10-12T12:00:00.000Z', weight: -20, reps: 8 },
      { setPosition: 1, sessionId, finishTime: '2026-10-12T12:00:00.000Z', weight: -20, reps: 10 },
      { setPosition: 2, sessionId, finishTime: '2026-10-12T12:00:00.000Z', weight: 0, reps: 6 },
    ]);
    const other = await database.insertExercise(fixture.db, 'Other');
    expect(await database.listExerciseProgress(fixture.db, other)).toEqual([]);
  });
});


describe('richer demo squat history', () => {
  beforeEach(async () => { await database.initializeDatabase(); });

  test('varies working weights and top-set positions and upgrades an older seed just once', async () => {
    await database.seedDemoHistory(fixture.db);
    const squat = (await database.listExercises(fixture.db)).find(row => row.name === '[Demo] Squat')!;
    const rows = await database.listExerciseProgress(fixture.db, squat.id);
    expect(rows).toHaveLength(54);
    for (const sessionId of new Set(rows.map(row => row.sessionId))) {
      const sets = rows.filter(row => row.sessionId === sessionId);
      expect(new Set(sets.map(row => row.weight)).size).toBe(3);
    }
    const heaviestPositions = new Set<number>();
    for (const sessionId of new Set(rows.map(row => row.sessionId))) {
      const sets = rows.filter(row => row.sessionId === sessionId);
      heaviestPositions.add(sets.reduce((best, set) => set.weight > best.weight ? set : best).setPosition);
    }
    expect([...heaviestPositions].sort()).toEqual([0, 1]);
    // Simulate the earlier seed, whose enrichment marker did not yet exist.
    fixture.connection.exec("DELETE FROM app_settings WHERE key = 'demo_squat_v2'");
    fixture.connection.prepare('UPDATE logged_sets SET weight = 70 WHERE id = ?').run(rows[0].id);
    expect(await database.seedDemoHistory(fixture.db)).toBe(true);
    expect(await database.listExerciseProgress(fixture.db, squat.id)).toEqual(rows);
    expect(await database.seedDemoHistory(fixture.db)).toBe(false);
    const bests = new Map<number, number>();
    const ordered = fixture.connection.prepare(`SELECT sets.weight, sets.reps, sets.rep_pr_improvement AS improvement
      FROM logged_sets sets JOIN logged_exercises ex ON ex.id = sets.logged_exercise_id
      JOIN logged_sessions sessions ON sessions.id = ex.logged_session_id
      WHERE ex.exercise_id = ? ORDER BY sessions.start_time, sessions.id, sets.order_number`).all(squat.id) as { weight: number; reps: number; improvement: number | null }[];
    for (const set of ordered) {
      const previous = bests.get(set.weight);
      expect(set.improvement).toBe(previous === undefined ? null : Math.max(0, set.reps - previous));
      bests.set(set.weight, Math.max(previous ?? set.reps, set.reps));
    }
  });

  test('does not recreate a demo squat that was deleted', async () => {
    await database.seedDemoHistory(fixture.db);
    fixture.connection.exec("DELETE FROM app_settings WHERE key = 'demo_squat_v2'");
    const squat = (await database.listExercises(fixture.db)).find(row => row.name === '[Demo] Squat')!;
    await database.deleteExercise(fixture.db, squat.id);
    expect(await database.seedDemoHistory(fixture.db)).toBe(false);
    expect(count('logged_sets')).toBe(162);
  });
});

describe('history calendar metadata', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('returns routine and current day number, keeping history when the routine is removed', async () => {
    const { routineId, day, exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.finishLoggedSession(fixture.db, sessionId);
    expect((await database.listFinishedWorkouts(fixture.db))[0]).toMatchObject({ routineId, trainingDayNumber: 1 });
    await fixture.db.runAsync('UPDATE training_days SET position = 2 WHERE id = ?', day.id);
    expect((await database.listFinishedWorkouts(fixture.db))[0].trainingDayNumber).toBe(3);
    await database.deleteRoutine(fixture.db, routineId);
    expect((await database.listFinishedWorkouts(fixture.db))[0]).toMatchObject({
      routineId: null, trainingDayNumber: null, routineName: 'Routine', trainingDayName: 'Day',
    });
  });
});

describe('PR prescription progression', () => {
  beforeEach(async () => { await database.initializeDatabase(); });

  test('a PR sets this training day target to reps plus one, without changing other days or historical prescriptions', async () => {
    const { day, exercise, sessionId } = await plan();
    const otherRoutine = await database.insertRoutine(fixture.db, 'Other routine', [{ name: 'Other day', exercises: [prescription(exercise.id, { prescribedRepsFirstSet: 12 })] }]);
    const [otherDay] = await database.listTrainingDays(fixture.db, otherRoutine);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(8);
    const result = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 10, -20);
    expect(result.isPersonalRecord).toBe(true);
    expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(11);
    expect((await database.listExercisesInTrainingDay(fixture.db, otherDay.id))[0].prescribedRepsFirstSet).toBe(12);
    expect((await database.listSavedSessionSets(fixture.db, sessionId))[0].prescribedRepsFirstSet).toBe(8);
    await fixture.db.runAsync('UPDATE day_exercises SET prescribed_reps_firstset = 15 WHERE training_day_id = ?', day.id);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 10, -20);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 2, 10, -20);
    expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(15);
  });

  test('a failed target update rolls back the new PR set', async () => {
    const { day, exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    fixture.connection.exec(`CREATE TRIGGER reject_target BEFORE UPDATE ON day_exercises
      BEGIN SELECT RAISE(ABORT, 'target failed'); END`);
    await expect(database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 10, -20)).rejects.toThrow('target failed');
    expect(count('logged_sets')).toBe(1);
    expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(8);
  });

  test('a deleted training day does not prevent saving a PR to the existing session', async () => {
    const { day, exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.deleteTrainingDay(fixture.db, day.id);
    expect((await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 9, -20)).isPersonalRecord).toBe(true);
    expect(count('logged_sets')).toBe(2);
  });
});


describe('single resumable workout', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('starting another workout closes earlier sessions, preserves sets, and finishing never resurfaces an older session', async () => {
    const { day, exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    const next = await database.createLoggedSession(fixture.db, day.id);
    expect(fixture.connection.prepare('SELECT id FROM logged_sessions WHERE finish_time IS NULL').all()).toEqual([{ id: next }]);
    expect((await database.getResumableSession(fixture.db))?.id).toBe(next);
    expect((await database.listFinishedWorkouts(fixture.db)).map(row => row.id)).toEqual([sessionId]);
    await database.finishLoggedSession(fixture.db, next);
    expect(await database.getResumableSession(fixture.db)).toBeNull();
    expect(count('logged_sets')).toBe(1);
  });
  test('a failed new-session insert keeps the earlier session resumable', async () => {
    const { day, sessionId } = await plan();
    fixture.connection.exec(`CREATE TRIGGER reject_session BEFORE INSERT ON logged_sessions
      BEGIN SELECT RAISE(ABORT, 'start failed'); END`);
    await expect(database.createLoggedSession(fixture.db, day.id)).rejects.toThrow('start failed');
    expect((await database.getResumableSession(fixture.db))?.id).toBe(sessionId);
    expect((await database.getLoggedSession(fixture.db, sessionId))?.finishTime).toBeNull();
  });
});

describe('deleting finished workouts', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('deletes just that session and its rows, preserving other history and plans', async () => {
    const { day, exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.finishLoggedSession(fixture.db, sessionId);
    const second = await database.createLoggedSession(fixture.db, day.id);
    await database.saveCompletedSet(fixture.db, second, exercise, 0, 0, 6, -10);
    await database.finishLoggedSession(fixture.db, second);
    await database.deleteFinishedWorkout(fixture.db, second);
    expect((await database.listFinishedWorkouts(fixture.db)).map(row => row.id)).toEqual([sessionId]);
    expect(count('logged_sets')).toBe(1);
    expect(count('logged_exercises')).toBe(1);
    expect(count('logged_sessions')).toBe(1);
    expect((await database.listExercisesWithRecords(fixture.db))[0]).toMatchObject({ heaviestWeight: -20, repsAtHeaviestWeight: 8 });
    expect(count('day_exercises')).toBe(1);
    expect(count('routines')).toBe(1);
    expect(fixture.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
  test('refuses to delete unfinished or nonexistent sessions', async () => {
    const { sessionId } = await plan();
    await expect(database.deleteFinishedWorkout(fixture.db, sessionId)).rejects.toThrow('Finished workout not found');
    await expect(database.deleteFinishedWorkout(fixture.db, 999)).rejects.toThrow('Finished workout not found');
    expect(count('logged_sessions')).toBe(1);
  });
  test('rolls back removed sets and exercises if session deletion fails', async () => {
    const { exercise, sessionId } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
    await database.finishLoggedSession(fixture.db, sessionId);
    fixture.connection.exec(`CREATE TRIGGER reject_delete BEFORE DELETE ON logged_sessions
      BEGIN SELECT RAISE(ABORT, 'delete failed'); END`);
    await expect(database.deleteFinishedWorkout(fixture.db, sessionId)).rejects.toThrow('delete failed');
    expect(count('logged_sets')).toBe(1);
    expect(count('logged_exercises')).toBe(1);
    expect(count('logged_sessions')).toBe(1);
  });
});

describe('exercise available weights', () => {
  beforeEach(async () => { await database.initializeDatabase(); });
  test('saves normalized weights with an exercise, copies independently, and deletes weights with the library entry', async () => {
    const curls = await database.insertExercise(fixture.db, 'Curls', [10, 4, 4, 17.5, -5]);
    expect(await database.listExerciseWeights(fixture.db, curls)).toEqual([-5, 4, 10, 17.5]);
    const rows = await database.insertExercise(fixture.db, 'Rows', await database.listExerciseWeights(fixture.db, curls));
    await database.setExerciseWeights(fixture.db, curls, [20, 12, 20]);
    expect(await database.listExerciseWeights(fixture.db, curls)).toEqual([12, 20]);
    expect(await database.listExerciseWeights(fixture.db, rows)).toEqual([-5, 4, 10, 17.5]);
    await database.setExerciseWeights(fixture.db, rows, []);
    expect(await database.listExerciseWeights(fixture.db, rows)).toEqual([]);
    await database.deleteExercise(fixture.db, curls);
    expect(await database.listExerciseWeights(fixture.db, curls)).toEqual([]);
    expect(count('exercise_weights')).toBe(0);
  });
  test('rejects invalid weights and missing exercises, and rolls back a failed replacement or creation', async () => {
    await expect(database.insertExercise(fixture.db, 'Bad', [NaN])).rejects.toThrow();
    expect(count('exercises')).toBe(0);
    await expect(database.setExerciseWeights(fixture.db, 999, [10])).rejects.toThrow('Exercise not found');
    const id = await database.insertExercise(fixture.db, 'Curls', [4]);
    await expect(database.setExerciseWeights(fixture.db, id, [Infinity])).rejects.toThrow();
    fixture.connection.exec(`CREATE TRIGGER reject_weight BEFORE INSERT ON exercise_weights
      BEGIN SELECT RAISE(ABORT, 'weight failed'); END`);
    await expect(database.setExerciseWeights(fixture.db, id, [10])).rejects.toThrow('weight failed');
    expect(await database.listExerciseWeights(fixture.db, id)).toEqual([4]);
    await expect(database.insertExercise(fixture.db, 'Rows', [10])).rejects.toThrow('weight failed');
    expect(count('exercises')).toBe(1);
  });
});


test('weight increment rules persist, copy independently, replace, and cascade', async () => {
  await database.initializeDatabase();
  const rules = [{ start: 10, increment: 2 }, { start: 4, increment: 1 }];
  const id = await database.insertExercise(fixture.db, 'Increment exercise', [17.5], rules);
  const profile = await database.getExerciseWeightOptions(fixture.db, id);
  expect(profile).toEqual({ weights: [17.5], increments: [rules[1], rules[0]] });
  const copied = await database.insertExercise(fixture.db, 'Copy exercise', profile.weights, profile.increments);
  await database.setExerciseWeights(fixture.db, id, [], [{ start: -20, increment: 2.5 }]);
  expect((await database.getExerciseWeightOptions(fixture.db, id)).increments).toEqual([{ start: -20, increment: 2.5 }]);
  expect(await database.getExerciseWeightOptions(fixture.db, copied)).toEqual(profile);
  await expect(database.setExerciseWeights(fixture.db, id, [], [{ start: 0, increment: 0 }])).rejects.toThrow();
  await expect(database.insertExercise(fixture.db, 'Invalid increments', [], [{ start: NaN, increment: 1 }])).rejects.toThrow();
  await database.deleteExercise(fixture.db, id);
  expect(await database.getExerciseWeightOptions(fixture.db, id)).toEqual({ weights: [], increments: [] });
  fixture.connection.exec(`CREATE TRIGGER reject_increment BEFORE INSERT ON exercise_weight_increments
    BEGIN SELECT RAISE(ABORT, 'increment failed'); END`);
  await expect(database.setExerciseWeights(fixture.db, copied, [99], [{ start: 0, increment: 5 }])).rejects.toThrow('increment failed');
  expect(await database.getExerciseWeightOptions(fixture.db, copied)).toEqual(profile);
  await expect(database.insertExercise(fixture.db, 'Failed increment', [99], [{ start: 0, increment: 5 }])).rejects.toThrow('increment failed');
  expect((await database.listExercises(fixture.db)).map(row => row.name)).not.toContain('Failed increment');
  await database.setExerciseWeights(fixture.db, copied, []);
  expect((await database.getExerciseWeightOptions(fixture.db, copied)).increments).toEqual([]);
});


test('last weights use the latest saved set at each position and exclude the current workout', async () => {
  await database.initializeDatabase();
  const { day, exercise, sessionId } = await plan();
  expect(await database.listLastSetWeights(fixture.db, sessionId)).toEqual([]);
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 7, -15);
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 2, 6, 0);
  const next = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, next, exercise, 0, 0, 8, -10);
  // Sets count immediately, even before finishing their workout.
  expect((await database.listLastSetWeights(fixture.db, -1)).find(row => row.setPosition === 0)?.weight).toBe(-10);
  const nullSet = await database.saveCompletedSet(fixture.db, next, exercise, 0, 1, 7, 10);
  await fixture.db.runAsync('UPDATE logged_sets SET weight = NULL WHERE id = ?', nullSet.id);
  const otherId = await database.insertExercise(fixture.db, 'Other exercise');
  await database.saveCompletedSet(fixture.db, next, { ...exercise, id: otherId }, 1, 0, 5, 100);
  const current = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, current, exercise, 0, 0, 9, 200);
  const old = await database.createLoggedSession(fixture.db, day.id);
  await fixture.db.runAsync("UPDATE logged_sessions SET start_time = '2000-01-01T00:00:00.000Z' WHERE id = ?", old);
  await database.saveCompletedSet(fixture.db, old, exercise, 0, 0, 5, 400);
  // Importing older history later must not replace a more recent workout's weight.
  const weights = await database.listLastSetWeights(fixture.db, current);
  expect(weights.filter(row => row.exerciseId === exercise.id).sort((a, b) => a.setPosition - b.setPosition)).toEqual([
    { exerciseId: exercise.id, setPosition: 0, weight: -10 },
    { exerciseId: exercise.id, setPosition: 1, weight: -15 },
    { exerciseId: exercise.id, setPosition: 2, weight: 0 },
  ]);
  expect(weights.find(row => row.exerciseId === otherId)?.weight).toBe(100);
});


describe('exercise annotations and tracking exclusions', () => {
  test('metadata saves before performance, restores, and does not create workout history by itself', async () => {
    await database.initializeDatabase();
    const { sessionId, exercise } = await plan();
    await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: '  Unexpected pain  ', excludeAll: false, excludedPositions: [0, 2, 2] });
    const [note] = await database.listExerciseAnnotations(fixture.db, sessionId);
    expect(note).toMatchObject({ id: exercise.id, comment: 'Unexpected pain', excludeAll: false, excludedPositions: [0, 2] });
    expect(await database.listSavedSessionSets(fixture.db, sessionId)).toEqual([]);
    await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: '', excludeAll: true, excludedPositions: [] });
    expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0]).toMatchObject({ comment: '', excludeAll: true, excludedPositions: [] });
    await database.deleteExercise(fixture.db, exercise.id);
    expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0]).toMatchObject({ id: -note.loggedExerciseId, exerciseId: null });
    await database.finishLoggedSession(fixture.db, sessionId);
    expect(await database.listFinishedWorkouts(fixture.db)).toEqual([]);
  });
  test('selective exclusions remove sets from PRs and plots but preserve history and weight defaults', async () => {
    await database.initializeDatabase();
    const { sessionId, exercise, day } = await plan();
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 3, 0, 8, 20);
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 3, 1, 15, 25);
    await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: 'Pain', excludeAll: false, excludedPositions: [1] });
    expect((await database.listExercisesWithRecords(fixture.db))[0]).toMatchObject({ heaviestWeight: 20, repsAtHeaviestWeight: 8 });
    const skippedId = await database.insertExercise(fixture.db, 'Skipped exercise');
    await database.saveExerciseAnnotation(fixture.db, sessionId, { ...exercise, id: skippedId, name: 'Skipped exercise' }, { comment: 'Stopped due to pain', excludeAll: false, excludedPositions: [] });
    const emptyId = await database.insertExercise(fixture.db, 'Empty annotation');
    await database.saveExerciseAnnotation(fixture.db, sessionId, { ...exercise, id: emptyId }, { comment: '', excludeAll: true, excludedPositions: [] });
    await database.finishLoggedSession(fixture.db, sessionId);
    expect((await database.listFinishedWorkouts(fixture.db))[0].exerciseNotes).toEqual([{ exerciseName: 'Skipped exercise', comment: 'Stopped due to pain' }]);
    expect((await database.listExerciseProgress(fixture.db, exercise.id)).map(set => set.weight)).toEqual([20]);
    expect((await database.listFinishedWorkouts(fixture.db))[0].sets[1]).toMatchObject({ weight: 25, exerciseComment: 'Pain', excludedFromTracking: true });
    expect((await database.listLastSetWeights(fixture.db, -1)).find(set => set.setPosition === 1)?.weight).toBe(25);
    const next = await database.createLoggedSession(fixture.db, day.id);
    const baseline = await database.saveCompletedSet(fixture.db, next, exercise, 0, 0, 10, 25);
    expect(baseline.isPersonalRecord).toBe(true);
    const record = await database.saveCompletedSet(fixture.db, next, exercise, 0, 1, 9, 20);
    expect(record.isPersonalRecord).toBe(false);
    expect(record.isSubmaximalRecord).toBe(true);
  });
  test('all sets applies to future added sets and can be reversed before finishing; annotation rows cascade on workout deletion', async () => {
    await database.initializeDatabase();
    const { sessionId, exercise } = await plan();
    await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: 'Bad day', excludeAll: true, excludedPositions: [] });
    await database.saveCompletedSet(fixture.db, sessionId, exercise, 5, 0, 8, 20);
    const result = await database.saveCompletedSet(fixture.db, sessionId, exercise, 5, 4, 20, 20);
    expect(result.isPersonalRecord).toBe(false);
    expect((await database.listExercisesWithRecords(fixture.db))[0].heaviestWeight).toBeNull();
    expect(fixture.connection.prepare('SELECT position FROM logged_exercises').get()).toEqual({ position: 5 });
    await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: 'Better', excludeAll: false, excludedPositions: [] });
    expect((await database.listExercisesWithRecords(fixture.db))[0]).toMatchObject({ heaviestWeight: 20, repsAtHeaviestWeight: 20 });
    await database.finishLoggedSession(fixture.db, sessionId);
    expect(await database.listExerciseProgress(fixture.db, exercise.id)).toHaveLength(2);
    await database.deleteFinishedWorkout(fixture.db, sessionId);
    expect(count('logged_exercise_annotations')).toBe(0);
    expect(count('logged_set_exclusions')).toBe(0);
  });
  test('validates active workouts and set numbers and rolls back partial metadata updates', async () => {
    await database.initializeDatabase();
    const { sessionId, exercise } = await plan();
    const note = { comment: 'Saved', excludeAll: false, excludedPositions: [0] };
    await expect(database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { ...note, excludedPositions: [-1] })).rejects.toThrow('Invalid set position');
    await expect(database.saveExerciseAnnotation(fixture.db, 999, exercise, note)).rejects.toThrow('Workout is not active');
    await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, note);
    fixture.connection.exec(`CREATE TRIGGER reject_exclusion BEFORE INSERT ON logged_set_exclusions BEGIN SELECT RAISE(ABORT, 'exclusion failed'); END`);
    await expect(database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { ...note, comment: 'Changed', excludedPositions: [1] })).rejects.toThrow('exclusion failed');
    expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0]).toMatchObject(note);
    await database.finishLoggedSession(fixture.db, sessionId);
    await expect(database.saveExerciseAnnotation(fixture.db, sessionId, exercise, note)).rejects.toThrow('Workout is not active');
  });
});


test('last rep defaults use the latest matching weight and position outside the active workout', async () => {
  await database.initializeDatabase();
  const { day, exercise, sessionId } = await plan();
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 6, 20);
  const second = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, second, exercise, 0, 1, 7, 20);
  const third = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, third, exercise, 0, 1, 8, 25);
  const active = await database.createLoggedSession(fixture.db, day.id);
  await database.saveCompletedSet(fixture.db, active, exercise, 0, 1, 99, 20);
  expect((await database.listLastSetReps(fixture.db, active)).sort((a, b) => a.weight - b.weight)).toEqual([
    { exerciseId: exercise.id, setPosition: 1, weight: 20, reps: 7 },
    { exerciseId: exercise.id, setPosition: 1, weight: 25, reps: 8 },
  ]);
});

test('manual custom weights persist atomically with completed sets and do not duplicate', async () => {
  await database.initializeDatabase();
  const { sessionId, exercise } = await plan();
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -17.5, true);
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 6, -17.5, true);
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 2, 5, 20);
  expect(await database.listExerciseWeights(fixture.db, exercise.id)).toEqual([-17.5]);
  fixture.connection.exec(`CREATE TRIGGER reject_custom_weight BEFORE INSERT ON exercise_weights
    BEGIN SELECT RAISE(ABORT, 'custom weight failed'); END`);
  await expect(database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 3, 5, 7.5, true)).rejects.toThrow('custom weight failed');
  expect(await database.listSavedSessionSets(fixture.db, sessionId)).toHaveLength(3);
  expect(await database.listExerciseWeights(fixture.db, exercise.id)).toEqual([-17.5]);
});

test('progression mode persists and fixed mode records PRs without updating prescribed reps', async () => {
  await database.initializeDatabase();
  expect(await database.getProgressionMode(fixture.db)).toBe('hypertrophy');
  const { sessionId, exercise, day } = await plan();
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, -20);
  await database.setProgressionMode(fixture.db, 'fixed');
  expect(await database.getProgressionMode(fixture.db)).toBe('fixed');
  const fixed = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 10, -20);
  expect(fixed.isPersonalRecord).toBe(true);
  expect(fixed.prescribedReps).toBeUndefined();
  expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(8);
  await database.setProgressionMode(fixture.db, 'hypertrophy');
  const auto = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 2, 11, -20);
  expect(auto.prescribedReps).toBe(12);
  expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(12);
});


test('logged exercise names follow library renames and fall back to snapshots after deletion', async () => {
  await database.initializeDatabase();
  const { sessionId, exercise } = await plan();
  await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: 'Note', excludeAll: false, excludedPositions: [] });
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 8, 20);
  await database.finishLoggedSession(fixture.db, sessionId);
  await fixture.db.runAsync('UPDATE exercises SET name = ? WHERE id = ?', 'Renamed dips', exercise.id);
  expect((await database.listSavedSessionSets(fixture.db, sessionId))[0].name).toBe('Renamed dips');
  expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0].name).toBe('Renamed dips');
  expect((await database.listFinishedWorkouts(fixture.db))[0].sets[0].exerciseName).toBe('Renamed dips');
  expect(await database.listExerciseProgress(fixture.db, exercise.id)).toHaveLength(1);
  await database.deleteExercise(fixture.db, exercise.id);
  expect((await database.listSavedSessionSets(fixture.db, sessionId))[0].name).toBe(exercise.name);
  expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0].name).toBe(exercise.name);
  expect((await database.listFinishedWorkouts(fixture.db))[0].sets[0].exerciseName).toBe(exercise.name);
});

test('routine management keeps one active routine and copied days have independent prescriptions', async () => {
  await database.initializeDatabase();
  const { routineId, day, exercise } = await plan();
  const older = await database.insertRoutine(fixture.db, 'Older routine', [{ name: 'Old leg day', exercises: [exercise] }]);
  expect(await database.getActiveRoutineId(fixture.db)).toBeNull();
  await database.setActiveRoutine(fixture.db, routineId);
  await database.setActiveRoutine(fixture.db, older);
  expect(await database.getActiveRoutineId(fixture.db)).toBe(older);
  expect((await database.listReusableTrainingDays(fixture.db)).map(row => row.name)).toContain('Old leg day');
  const copied = await database.insertRoutine(fixture.db, 'Copy', [{ name: day.name, exercises: await database.listExercisesInTrainingDay(fixture.db, day.id) }]);
  const [copyDay] = await database.listTrainingDays(fixture.db, copied);
  expect(copyDay.id).not.toBe(day.id);
  await database.updateExercisePrescription(fixture.db, copyDay.id, { ...exercise, prescribedRepsFirstSet: 12, prescribedWeightFirstSet: -17.5 });
  expect((await database.listExercisesInTrainingDay(fixture.db, copyDay.id))[0].prescribedRepsFirstSet).toBe(12);
  expect((await database.listExercisesInTrainingDay(fixture.db, day.id))[0].prescribedRepsFirstSet).toBe(8);
  await database.deleteRoutine(fixture.db, older);
  expect(await database.getActiveRoutineId(fixture.db)).toBeNull();
});

test('sortable orders persist without changing prescriptions and reject stale exercise lists', async () => {
  await database.initializeDatabase();
  const { day, exercise } = await plan();
  const second = await database.insertExercise(fixture.db, 'Rows');
  await fixture.db.runAsync('INSERT INTO day_exercises (training_day_id, exercise_id, position) VALUES (?, ?, ?)', day.id, second, 1);
  await database.setStartScreenOrder(fixture.db, ['Settings', 'Session', 'Routines']);
  expect(await database.getStartScreenOrder(fixture.db)).toEqual(['Settings', 'Session', 'Routines']);
  await database.reorderTrainingDayExercises(fixture.db, day.id, [second, exercise.id]);
  const entries = await database.listExercisesInTrainingDay(fixture.db, day.id);
  expect(entries.map(entry => entry.id)).toEqual([second, exercise.id]);
  expect(entries[1].prescribedRepsFirstSet).toBe(8);
  await expect(database.reorderTrainingDayExercises(fixture.db, day.id, [second, second])).rejects.toThrow();
  expect((await database.listExercisesInTrainingDay(fixture.db, day.id)).map(entry => entry.id)).toEqual([second, exercise.id]);
});


test('weight takes priority over rep records, including negative assistance, and survives reload/edit', async () => {
  await database.initializeDatabase();
  const { exercise, sessionId } = await plan();
  await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 0, 10, -20);
  const heavier = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 1, 5, -10);
  expect(heavier.isPersonalRecord).toBe(true);
  const lighter = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 2, 12, -20);
  expect(lighter).toMatchObject({ isPersonalRecord: false, isSubmaximalRecord: true });
  const equalWeight = await database.saveCompletedSet(fixture.db, sessionId, exercise, 0, 3, 6, -10);
  expect(equalWeight.isPersonalRecord).toBe(true);
  expect((await database.listSavedSessionSets(fixture.db, sessionId)).map(set => set.recordKind))
    .toEqual([null, 'pr', 'submaximal', 'pr']);
  await database.finishLoggedSession(fixture.db, sessionId);
  await database.updateLoggedSet(fixture.db, sessionId, lighter.id, -20, 13);
  expect((await database.listFinishedWorkouts(fixture.db))[0].sets.find(set => set.id === lighter.id))
    .toMatchObject({ recordKind: 'submaximal', repPrImprovement: 3 });
});

test('exercise setup notes can be saved, replaced and cleared without changing workout comments', async () => {
  await database.initializeDatabase();
  const { exercise, sessionId } = await plan();
  await database.saveExerciseNote(fixture.db, exercise.id, ' Chair 4 ');
  expect(await database.listExerciseNotes(fixture.db)).toEqual([{ exerciseId: exercise.id, note: 'Chair 4' }]);
  await database.saveExerciseAnnotation(fixture.db, sessionId, exercise, { comment: 'Sore today', excludeAll: false, excludedPositions: [] });
  await database.saveExerciseNote(fixture.db, exercise.id, 'Chair 5');
  expect((await database.listExerciseAnnotations(fixture.db, sessionId))[0].comment).toBe('Sore today');
  await database.saveExerciseNote(fixture.db, exercise.id, '');
  expect(await database.listExerciseNotes(fixture.db)).toEqual([{ exerciseId: exercise.id, note: '' }]);
});


test('upgrading an existing database relabels lighter rep records without deleting history', async () => {
  fixture.connection.exec(readFileSync(join(__dirname, 'fixtures/baseline-2026-10-15.sql'), 'utf8'));
  fixture.connection.exec(`
    INSERT INTO exercises VALUES (1, 'Bench');
    INSERT INTO logged_sessions (id, start_time, finish_time, training_day_name, routine_name)
      VALUES (1, '2026-10-01', '2026-10-01', 'Day', 'Routine');
    INSERT INTO logged_exercises (id, exercise_id, logged_session_id, position, prescribed_sets, exercise_name)
      VALUES (1, 1, 1, 0, 3, 'Bench');
    INSERT INTO logged_sets (id, logged_exercise_id, order_number, reps, weight, rep_pr_improvement)
      VALUES (1, 1, 0, 5, 100, NULL), (2, 1, 1, 10, 80, 2), (3, 1, 2, 6, 100, 1);
  `);
  await database.initializeDatabase();
  expect((await database.listSavedSessionSets(fixture.db, 1)).map(set => set.recordKind)).toEqual([null, 'submaximal', 'pr']);
  expect(count('logged_sets')).toBe(3);
});
