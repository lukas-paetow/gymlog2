import type { SQLiteDatabase } from 'expo-sqlite';
import bundledLegacy from './data/legacy.json';

type LegacySet = { position: number; weight_kg: number | null; reps: number };
type LegacyEntry = {
  line: number; exercise: string; comment: string; exclude_from_tracking: boolean; sets: LegacySet[];
};
type LegacySession = {
  id: number; date: string; date_status: string; date_lower_bound: string | null;
  date_upper_bound: string | null; source_line: number; note: string; entries: LegacyEntry[];
};
type LegacyData = { dataset: string; source_sha256: string; sessions: LegacySession[] };
export type LegacyImportResult = { added: boolean; workouts: number; sets: number; exercisesCreated: number };

/** Imports the reviewed bundled dataset once, without changing plans or PR badges. */
export async function importLegacy(db: SQLiteDatabase): Promise<LegacyImportResult> {
  const start = Date.now();
  try {
    const data: LegacyData = bundledLegacy;
    const result: LegacyImportResult = { added: false, workouts: 0, sets: 0, exercisesCreated: 0 };
    await db.withTransactionAsync(async () => {
      if (await db.getFirstAsync("SELECT value FROM app_settings WHERE key = 'legacy_import_v1'")) return;
      const library = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM exercises ORDER BY id');
      const ids = new Map<string, number>();
      for (const exercise of library) {
        const key = exercise.name.trim().toLowerCase();
        if (!ids.has(key)) ids.set(key, exercise.id);
      }
      const provenance = [];
      // Oldest first gives stable ordering for last-performance history queries.
      const sessions = [...data.sessions].sort((a, b) => a.date.localeCompare(b.date) || b.id - a.id);
      for (const session of sessions) {
        // Local noon preserves the source calendar date without asserting a known
        // workout time. Original date-only values and bounds are stored below.
        const [year, month, day] = session.date.split('-').map(Number);
        const timestamp = new Date(year, month - 1, day, 12).toISOString();
        const saved = await db.runAsync(`INSERT INTO logged_sessions
          (training_day_id, start_time, finish_time, training_day_name, routine_name)
          VALUES (NULL, ?, ?, ?, ?)`, timestamp, timestamp,
          session.date_status === 'estimated' ? 'Workout (estimated date)' : 'Workout', data.dataset);
        provenance.push({ sessionId: saved.lastInsertRowId, sourceSessionId: session.id,
          sourceLine: session.source_line, date: session.date, dateStatus: session.date_status,
          lowerBound: session.date_lower_bound, upperBound: session.date_upper_bound, note: session.note });
        for (const [position, entry] of session.entries.entries()) {
          const key = entry.exercise.trim().toLowerCase();
          let exerciseId = ids.get(key);
          if (exerciseId === undefined) {
            exerciseId = (await db.runAsync('INSERT INTO exercises (name) VALUES (?)', entry.exercise)).lastInsertRowId;
            ids.set(key, exerciseId);
            result.exercisesCreated++;
          }
          const first = entry.sets[0];
          const exercise = await db.runAsync(`INSERT INTO logged_exercises
            (exercise_id, logged_session_id, position, prescribed_sets,
             prescribed_weight_firstset, prescribed_reps_firstset, exercise_name)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, exerciseId, saved.lastInsertRowId, position,
            entry.sets.length, first.weight_kg, first.reps, entry.exercise);
          // Imported performance supplies required snapshot fields; no routine
          // prescription is created or modified by this import.
          if (entry.comment || entry.exclude_from_tracking) {
            await db.runAsync(`INSERT INTO logged_exercise_annotations
              (logged_exercise_id, comment, exclude_all) VALUES (?, ?, ?)`,
              exercise.lastInsertRowId, entry.comment, Number(entry.exclude_from_tracking));
          }
          const values = entry.sets.map(() => '(?, ?, ?, ?, NULL, ?)').join(',');
          await db.runAsync(`INSERT INTO logged_sets
            (logged_exercise_id, order_number, reps, weight, rep_pr_improvement, comment) VALUES ${values}`,
            ...entry.sets.flatMap(set => [exercise.lastInsertRowId, set.position, set.reps, set.weight_kg, `Legacy source line ${entry.line}`]));
          result.sets += entry.sets.length;
        }
        result.workouts++;
      }
      await db.runAsync("INSERT INTO app_settings (key, value) VALUES ('legacy_import_v1', ?)",
        JSON.stringify({ dataset: data.dataset, sourceSha256: data.source_sha256, sessions: provenance }));
      result.added = true;
    });
    return result;
  } finally {
    console.log(`[DB] importLegacy: ${Date.now() - start}ms`);
  }
}
