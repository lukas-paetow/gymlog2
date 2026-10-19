import { useCallback } from 'react';
import Sortable from 'react-native-sortables';
import type { SortableGridProps, SortableGridRenderItem } from 'react-native-sortables';
import { StyleSheet, Text, View } from 'react-native';
import type { TrainingDayExercise } from '../database';

type Props = { name: string; exercises: TrainingDayExercise[]; onEdit: (exercise: TrainingDayExercise) => void; disabled: boolean; onReorder: (exercises: TrainingDayExercise[]) => void; scrollableRef: SortableGridProps<TrainingDayExercise>['scrollableRef'] };

export default function TrainingDayTable({ name, exercises, onEdit, disabled, onReorder, scrollableRef }: Props) {
  const renderItem = useCallback<SortableGridRenderItem<TrainingDayExercise>>(({ item: exercise }) => (
    <Sortable.Touchable style={styles.row}
      accessibilityRole="button" accessibilityLabel={`Edit ${name}: ${exercise.name} prescription`}
      accessibilityState={{ disabled }} accessibilityHint="Tap to edit prescription; hold and drag to reorder"
      onTap={() => { if (!disabled) onEdit(exercise); }}
      accessibilityActions={[{ name: 'activate', label: 'Edit prescription' }]}
      onAccessibilityAction={() => { if (!disabled) onEdit(exercise); }}>
      <Text style={styles.exercise}>{exercise.name}</Text>
      <Text style={styles.number}>{exercise.prescribedSets}</Text>
      <Text style={styles.weight}>{exercise.prescribedWeightFirstSet}</Text>
      <Text style={styles.number}>{exercise.prescribedRepsFirstSet}</Text>
    </Sortable.Touchable>
  ), [disabled, name, onEdit]);
  return <View style={styles.table}>
    <Text style={styles.title}>{name}</Text>
    <View style={[styles.row, styles.header]}>
      <Text style={styles.exercise}>Exercise</Text><Text style={styles.number}>Sets</Text>
      <Text style={styles.weight}>kg</Text><Text style={styles.number}>Reps</Text>
    </View>
    <Sortable.Grid columns={1} data={exercises} renderItem={renderItem} keyExtractor={exercise => String(exercise.id)}
      scrollableRef={scrollableRef} dragActivationDelay={400} sortEnabled={!disabled} activeItemScale={1.02}
      inactiveItemOpacity={0.75} overDrag="none" onDragEnd={({ data, fromIndex, toIndex }) => {
        if (fromIndex !== toIndex) onReorder(data);
      }} />
    {exercises.length === 0 && <Text style={{ padding: 10 }}>No exercises.</Text>}
  </View>;
}
const styles = StyleSheet.create({
  table: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', padding: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: '#e2e8f0' },
  header: { backgroundColor: '#f1f5f9' }, exercise: { flex: 1 },
  number: { width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] },
  weight: { width: 56, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
