import { DATE_FORMATS, DEFAULT_DATE_FORMAT, formatWorkoutDate, isDateFormat } from '../dateFormat';

test('accepts exactly the supported formats and defaults to day/month/year', () => {
  expect(DEFAULT_DATE_FORMAT).toBe('DD/MM/YYYY');
  for (const format of DATE_FORMATS) expect(isDateFormat(format)).toBe(true);
  expect(isDateFormat('invalid')).toBe(false);
});

test.each([
  ['DD/MM/YYYY', '23/11/2026'], ['MM/DD/YYYY', '11/23/2026'], ['YYYY-MM-DD', '2026-11-23'],
] as const)('formats %s without time', (format, expected) => {
  expect(formatWorkoutDate('2026-11-23T12:00:00.000Z', format)).toBe(expected);
});

test('system uses the runtime locale', () => {
  const timestamp = '2026-11-23T12:00:00.000Z';
  expect(formatWorkoutDate(timestamp, 'system')).toBe(new Date(timestamp).toLocaleDateString());
});

test('handles leap day, padding, and local midnight', () => {
  expect(formatWorkoutDate('2024-02-29T12:00:00.000Z', 'DD/MM/YYYY')).toBe('29/02/2024');
  expect(formatWorkoutDate('2026-01-02T12:00:00.000Z', 'MM/DD/YYYY')).toBe('01/02/2026');
  expect(formatWorkoutDate('2026-11-23T23:30:00.000Z', 'DD/MM/YYYY')).toBe('24/11/2026');
});
