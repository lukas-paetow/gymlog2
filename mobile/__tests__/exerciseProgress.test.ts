import { recentExerciseHistory, sessionVolumes, setColor, topSets } from '../exerciseProgress';
import type { ExerciseHistorySet } from '../database';
import type { ExerciseProgressPoint } from '../database';

const set = (id: number, sessionId: number, setPosition: number, weight: number, reps: number): ExerciseProgressPoint =>
  ({ id, sessionId, setPosition, weight, reps, finishTime: '2026-10-01T12:00:00Z' });

test('recent history plots only two calendar months of weighted tracked sets', () => {
  const row = (sessionId: number, date: string, extra: Partial<ExerciseHistorySet> = {}): ExerciseHistorySet =>
    ({ sessionId, finishTime: date, setPosition: 0, weight: -10, reps: 8, comment: '', excluded: 0, ...extra });
  const rows = [row(1, '2026-08-18T12:00:00'), row(2, '2026-08-19T00:00:00'),
    row(3, '2026-10-18T12:00:00'), row(4, '2026-10-18T12:00:00', { excluded: 1 }),
    row(5, '2026-10-18T12:00:00', { weight: null }), row(6, '2026-10-20T12:00:00')];
  expect(recentExerciseHistory(rows, new Date('2026-10-19T12:00:00')).map(row => row.sessionId)).toEqual([2, 3]);
  expect(rows).toHaveLength(6); // Full history list is retained.
  expect(recentExerciseHistory([row(7, '2026-06-30T12:00:00'), row(8, '2026-06-29T12:00:00')],
    new Date('2026-08-31T12:00:00')).map(row => row.sessionId)).toEqual([7]);
});

test('top sets use heaviest weight, reps for ties, and earliest set as final tie breaker', () => {
  const rows = [
    set(1, 1, 0, 70, 12), set(2, 1, 1, 80, 6), set(3, 1, 2, 80, 8),
    set(4, 1, 3, 80, 7), set(5, 1, 4, 80, 8), set(6, 1, 5, 60, 20),
    set(7, 2, 2, -10, 8), set(8, 2, 0, -10, 8), set(9, 2, 1, -20, 12),
  ];
  expect(topSets(rows).map(row => row.id)).toEqual([3, 8]);
  expect(topSets([])).toEqual([]);
});

test('set colors remain consistent across filtering and allow more than a small fixed palette', () => {
  expect(setColor(1)).toBe(setColor(1));
  expect(new Set(Array.from({ length: 12 }, (_, index) => setColor(index))).size).toBe(12);
});

test('volume adds every set within its session and top-set filtering uses weight rather than volume', () => {
  const rows = [set(1, 1, 0, 60, 10), set(2, 1, 1, 80, 5), set(3, 2, 0, 50, 8), set(4, 2, 1, 50, 6)];
  expect(sessionVolumes(rows)).toEqual([
    { sessionId: 1, finishTime: rows[0].finishTime, volume: 1000 },
    { sessionId: 2, finishTime: rows[2].finishTime, volume: 700 },
  ]);
  expect(sessionVolumes(topSets(rows)).map(row => row.volume)).toEqual([400, 400]);
  expect(sessionVolumes([])).toEqual([]);
  expect(sessionVolumes([set(5, 1, 0, 0, 10)])[0].volume).toBe(0);
});
