import { importLegacy } from '../legacyImport';
import { initializeDatabase, listFinishedWorkouts, listExerciseProgress } from '../database';
import { createTestDatabase } from './support/sqlite';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
const fixture = createTestDatabase();

beforeAll(async () => {
  jest.mocked(require('expo-sqlite').openDatabaseAsync).mockResolvedValue(fixture.db);
  await initializeDatabase();
});
afterAll(() => fixture.close());
beforeEach(() => {
  fixture.connection.exec(`DELETE FROM logged_exercise_annotations; DELETE FROM logged_sets;
    DELETE FROM logged_exercises; DELETE FROM logged_sessions; DELETE FROM exercises; DELETE FROM app_settings;`);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('imports the full reviewed dataset, reuses names, preserves exclusions and prevents duplicates', async () => {
  await fixture.db.runAsync('INSERT INTO exercises (name) VALUES (?)', 'bench press');
  const result = await importLegacy(fixture.db);
  expect(result).toEqual({ added: true, workouts: 278, sets: 5973, exercisesCreated: 59 });
  const history = await listFinishedWorkouts(fixture.db);
  expect(history).toHaveLength(278);
  expect(history.every(workout => workout.routineName === 'Legacy')).toBe(true);
  expect(history.flatMap(workout => workout.sets).filter(set => set.excludedFromTracking)).toHaveLength(4);
  expect(history.flatMap(workout => workout.sets).some(set => set.exerciseComment?.includes('other tower'))).toBe(true);
  expect(await fixture.db.getFirstAsync('SELECT COUNT(*) AS count FROM exercises')).toEqual({ count: 60 });
  expect(await fixture.db.getFirstAsync('SELECT COUNT(*) AS count FROM logged_sets WHERE rep_pr_improvement IS NOT NULL')).toEqual({ count: 0 });
  const metadata = await fixture.db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key='legacy_import_v1'");
  const sessions = JSON.parse(metadata!.value).sessions;
  expect(sessions.filter((s: { dateStatus: string }) => s.dateStatus === 'estimated')).toHaveLength(4);
  for (const session of sessions) {
    const workout = history.find(w => w.id === session.sessionId)!;
    const local = new Date(workout.finishTime);
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(date).toBe(session.date);
  }
  const ote = await fixture.db.getFirstAsync<{ id: number }>("SELECT id FROM exercises WHERE name='Overhead triceps extension'");
  const progress = await listExerciseProgress(fixture.db, ote!.id);
  const oteSets = history.flatMap(workout => workout.sets).filter(set => set.exerciseName === 'Overhead triceps extension');
  expect(oteSets.filter(set => set.excludedFromTracking)).toHaveLength(2);
  expect(progress).toHaveLength(oteSets.filter(set => !set.excludedFromTracking && set.weight !== null).length);
  expect(progress.some(point => oteSets.some(set => set.id === point.id && set.excludedFromTracking))).toBe(false);
  expect(await importLegacy(fixture.db)).toEqual({ added: false, workouts: 0, sets: 0, exercisesCreated: 0 });
  expect(await fixture.db.getFirstAsync('SELECT COUNT(*) AS count FROM logged_sets')).toEqual({ count: 5973 });
});

test('rolls back a failed import and allows a clean retry', async () => {
  const original = fixture.adapter.runAsync.bind(fixture.adapter);
  let calls = 0;
  const write = jest.spyOn(fixture.adapter, 'runAsync').mockImplementation(async (...args) => {
    if (++calls === 15) throw new Error('Simulated write failure');
    return original(...args);
  });
  await expect(importLegacy(fixture.db)).rejects.toThrow('Simulated write failure');
  expect(await fixture.db.getFirstAsync('SELECT COUNT(*) AS count FROM logged_sessions')).toEqual({ count: 0 });
  expect(await fixture.db.getFirstAsync('SELECT COUNT(*) AS count FROM exercises')).toEqual({ count: 0 });
  expect(await fixture.db.getFirstAsync("SELECT value FROM app_settings WHERE key='legacy_import_v1'")).toBeNull();
  write.mockRestore();
  expect((await importLegacy(fixture.db)).added).toBe(true);
});
