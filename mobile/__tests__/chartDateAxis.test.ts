import { buildDateAxis } from '../chartDateAxis';

const timestamp = (value: string) => new Date(value).getTime();

test('places a month boundary between daily ticks using local calendar dates', () => {
  const axis = buildDateAxis(timestamp('2026-09-29T12:00:00'), timestamp('2026-10-03T12:00:00'), 300);
  expect(axis.ticks.map(tick => tick.day)).toEqual([29, 30, 1, 2, 3]);
  expect(axis.months.map(month => month.x)).toEqual([0, 120]);
  expect(axis.months.map(month => month.showLabel)).toEqual([true, true]);
  expect(axis.position(timestamp('2026-10-01T12:00:00'))).toBe(150);
});

test('a single observation has a full calendar day and a month label', () => {
  const axis = buildDateAxis(timestamp('2026-10-15T12:00:00'), timestamp('2026-10-15T12:00:00'), 300);
  expect(axis.ticks).toEqual([{ x: 0, day: 15, showLabel: true }]);
  expect(axis.months[0].showLabel).toBe(true);
  expect(axis.position(timestamp('2026-10-15T12:00:00'))).toBe(150);
});

test('thins ticks and labels when many days share a narrow plot', () => {
  const axis = buildDateAxis(timestamp('2025-12-31T12:00:00'), timestamp('2026-02-01T12:00:00'), 120);
  expect(axis.ticks.filter(tick => tick.showLabel).length).toBeLessThan(6);
  expect(axis.months.map(month => month.showLabel)).toEqual([false, true, false]);
  const narrow = buildDateAxis(timestamp('2026-01-01T12:00:00'), timestamp('2026-12-31T12:00:00'), 120);
  expect(narrow.ticks.length).toBeLessThan(50);
});
