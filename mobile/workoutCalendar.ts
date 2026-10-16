import type { FinishedWorkout } from './database';

export function routineKey(workout: FinishedWorkout): string {
  return workout.routineId === null ? `deleted:${workout.routineName}` : `routine:${workout.routineId}`;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** A Monday-first grid with complete weeks. Dates are local calendar dates. */
export function monthCells(year: number, month: number): (Date | null)[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > count ? null : new Date(year, month, day, 12);
  });
}
