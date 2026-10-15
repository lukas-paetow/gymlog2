import type { ExerciseProgressPoint } from './database';

/** One top set per session: heaviest weight, then most reps, then earliest set. */
export function topSets(history: ExerciseProgressPoint[]): ExerciseProgressPoint[] {
  const best = new Map<number, ExerciseProgressPoint>();
  for (const set of history) {
    const previous = best.get(set.sessionId);
    if (!previous || set.weight > previous.weight ||
        (set.weight === previous.weight && set.reps > previous.reps) ||
        (set.weight === previous.weight && set.reps === previous.reps && set.setPosition < previous.setPosition)) {
      best.set(set.sessionId, set);
    }
  }
  return history.filter(set => best.get(set.sessionId) === set);
}

export function setColor(position: number): string {
  return `hsl(${(position * 137.5 + 215) % 360}, 65%, 40%)`;
}

export type SessionVolume = { sessionId: number; finishTime: string; volume: number };

/** Sums this exercise's sets per workout. Call with non-assisted weights only. */
export function sessionVolumes(sets: ExerciseProgressPoint[]): SessionVolume[] {
  const sessions = new Map<number, SessionVolume>();
  for (const set of sets) {
    const session = sessions.get(set.sessionId);
    const volume = set.weight * set.reps;
    if (session) session.volume += volume;
    else sessions.set(set.sessionId, { sessionId: set.sessionId, finishTime: set.finishTime, volume });
  }
  return [...sessions.values()];
}
