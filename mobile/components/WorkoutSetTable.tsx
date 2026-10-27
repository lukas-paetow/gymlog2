import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type WorkoutTableRow = {
  id: number | string; weight: number | null; reps: number | null;
  exerciseName?: string; comment?: string; isPR?: boolean; isSubmaximalPR?: boolean; excluded?: boolean;
  setNumber?: number;
};
type Props = { rows: WorkoutTableRow[]; showExercise?: boolean; showSetNumber?: boolean; disabled?: boolean;
  onEdit?: (row: WorkoutTableRow) => void; onHold?: () => void };

/** Weight before reps, with persistent PR badges and optional double-tap editing. */
export default function WorkoutSetTable({ rows, showExercise = false, showSetNumber = false, disabled, onEdit, onHold }: Props) {
  const lastTap = useRef<{ id: number | string; time: number } | null>(null);
  return <View style={styles.table}>
    <View style={[styles.row, styles.header]}>
      {showExercise && <Text style={styles.exercise}>Exercise</Text>}
      <Text style={[styles.weight, showSetNumber && styles.summaryWeight]}>kg</Text><Text style={styles.times} />
      <Text style={[styles.reps, showSetNumber && styles.summaryReps]}>Reps</Text>
      {showSetNumber && <View style={{ flex: 1 }} />}
      <Text style={styles.badgeSpace}>PR</Text>
      {showSetNumber && <Text style={styles.setNumber}>Set</Text>}
    </View>
    {rows.map(row => {
      const content = <>
        {showExercise && <View style={styles.exercise}><Text>{row.exerciseName}</Text>{!!row.comment && <Text style={styles.note}>{row.comment}</Text>}</View>}
        <Text style={[styles.weight, showSetNumber && styles.summaryWeight]}>{row.weight ?? '—'}</Text><Text style={styles.times}>×</Text>
        <Text style={[styles.reps, showSetNumber && styles.summaryReps]}>{row.reps ?? '—'}</Text>
        {showSetNumber && <View style={{ flex: 1 }} />}
        <View style={styles.badgeSpace}>{row.isSubmaximalPR && !row.excluded && <Text accessibilityLabel="Submaximal PR" style={styles.submaximal}>sub PR</Text>}{row.isPR && !row.excluded && <Text style={styles.badge}>PR</Text>}</View>
        {showSetNumber && <Text style={styles.setNumber}>{row.setNumber}</Text>}
        {row.excluded && <Text style={styles.excluded}>Excluded from PRs and plots</Text>}
      </>;
      return onEdit ? <Pressable key={row.id} style={styles.row} disabled={disabled}
        accessibilityRole="button" accessibilityLabel={`Edit ${row.exerciseName ?? 'logged set'}: ${row.weight ?? 'unknown'} kg × ${row.reps} reps`}
        accessibilityHint="Double tap to edit weight and reps" accessibilityActions={[{ name: 'activate', label: 'Edit set' }]}
        onAccessibilityAction={() => { if (!disabled) onEdit(row); }}
        onLongPress={() => { lastTap.current = null; onHold?.(); }}
        onPress={() => {
          const now = Date.now();
          if (lastTap.current?.id === row.id && now - lastTap.current.time < 300) {
            lastTap.current = null;
            onEdit(row);
          } else lastTap.current = { id: row.id, time: now };
        }}>{content}</Pressable> : <View key={row.id} style={styles.row}>{content}</View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: 10, borderTopWidth: 1, borderColor: '#e2e8f0' },
  header: { backgroundColor: '#f1f5f9' }, exercise: { flex: 1, minWidth: 70 },
  weight: { width: 48, textAlign: 'right', fontVariant: ['tabular-nums'] },
  times: { width: 8, textAlign: 'center', color: '#64748b' },
  reps: { width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] }, badgeSpace: { width: 26, textAlign: 'center' },
  badge: { color: '#166534', backgroundColor: '#dcfce7', borderRadius: 4, fontSize: 11, fontWeight: '700', textAlign: 'center', paddingVertical: 3 },
  submaximal: { color: '#64748b', fontSize: 9, textAlign: 'center' },
  excluded: { width: '100%', fontSize: 11, color: '#64748b' }, note: { fontSize: 12, color: '#64748b' },
  summaryWeight: { textAlign: 'left', width: 44 }, summaryReps: { textAlign: 'left' },
  setNumber: { width: 26, textAlign: 'right', color: '#64748b', fontVariant: ['tabular-nums'] },
});
