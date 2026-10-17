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

test('long histories show year markers and hide day ticks and month labels', () => {
  const axis = buildDateAxis(timestamp('2024-04-25T12:00:00'), timestamp('2026-10-16T12:00:00'), 300);
  expect(axis.ticks).toEqual([]);
  expect(axis.years.map(year => year.label)).toEqual(['2024', '2025', '2026']);
  expect(axis.years.every(year => year.showLabel)).toBe(true);
  expect(axis.years[1].x).toBe(axis.position(timestamp('2025-01-01T00:00:00')));
  expect(axis.months.every(month => !month.showLabel)).toBe(true);
  const short = buildDateAxis(timestamp('2025-12-29T12:00:00'), timestamp('2026-01-05T12:00:00'), 300);
  expect(short.years).toEqual([]);
  expect(short.ticks.length).toBeGreaterThan(0);
});
