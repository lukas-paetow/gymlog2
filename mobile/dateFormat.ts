export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'system'] as const;
export type DateFormat = typeof DATE_FORMATS[number];
export const DEFAULT_DATE_FORMAT: DateFormat = 'DD/MM/YYYY';

export function isDateFormat(value: string): value is DateFormat {
  return DATE_FORMATS.some(format => format === value);
}

/** Formats a timestamp as a local calendar date; stored timestamps remain UTC. */
export function formatWorkoutDate(timestamp: string, format: DateFormat): string {
  const date = new Date(timestamp);
  if (format === 'system') return date.toLocaleDateString();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  switch (format) {
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
  }
}
