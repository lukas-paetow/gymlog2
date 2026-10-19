import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Button, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { addLoggedSet, deleteLoggedSet, deleteFinishedWorkout, getDateFormat, initializeDatabase, listFinishedWorkouts, updateLoggedSet } from '../database';
import type { FinishedWorkout } from '../database';
import { DEFAULT_DATE_FORMAT, formatWorkoutDate } from '../dateFormat';
import WorkoutCalendar from '../components/WorkoutCalendar';
import type { DateFormat } from '../dateFormat';
import WorkoutSetTable from '../components/WorkoutSetTable';
import EditLoggedSetModal from '../components/EditLoggedSetModal';

export default function WorkoutHistoryScreen() {
  const deletingRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<FinishedWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>(DEFAULT_DATE_FORMAT);
  const [editingWorkoutId, setEditingWorkoutId] = useState<number | null>(null);
  const [editingSet, setEditingSet] = useState<{ sessionId: number; set: FinishedWorkout['sets'][number]; adding?: boolean } | null>(null);
  const [addingWorkout, setAddingWorkout] = useState<FinishedWorkout | null>(null);

  async function refreshHistory() {
    const rows = await listFinishedWorkouts(await initializeDatabase());
    setWorkouts(rows);
    setEditingWorkoutId(current => rows.some(workout => workout.id === current) ? current : null);
    setSelectedWorkoutId(current => rows.some(workout => workout.id === current) ? current : null);
  }

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    async function loadHistory() {
      setIsLoading(true);
      setError(null);
      try {
        const db = await initializeDatabase();
        const rows = await listFinishedWorkouts(db);
        const format = await getDateFormat(db);
        if (!cancelled) {
          setWorkouts(rows);
          setDateFormat(format);
        }
      } catch (cause) {
        console.error('Loading workout history failed:', cause);
        if (!cancelled) setError('Could not load workout history.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, []));

  async function removeWorkout(sessionId: number) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try {
      const db = await initializeDatabase();
      await deleteFinishedWorkout(db, sessionId);
      setWorkouts(current => current.filter(workout => workout.id !== sessionId));
      setSelectedWorkoutId(current => current === sessionId ? null : current);
    } catch (cause) {
      console.error('Deleting workout failed:', cause);
      Alert.alert('Delete failed', 'Could not delete the workout. Please try again.');
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  function confirmDelete(workout: FinishedWorkout) {
    if (deletingRef.current) return;
    Alert.alert('Workout options',
      `${workout.routineName} · ${workout.trainingDayName}\n${formatWorkoutDate(workout.finishTime, dateFormat)}\nDelete this workout and all its logged sets?\n\nSaved PR flags in other workouts stay unchanged. Your current PRs may change because they are calculated from the remaining history.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit', onPress: () => { setEditingWorkoutId(workout.id); setSelectedWorkoutId(workout.id); } },
        { text: 'Delete', style: 'destructive', onPress: () => removeWorkout(workout.id) },
      ]);
  }

  const selectedWorkout = workouts.find(workout => workout.id === selectedWorkoutId);
  const displayedWorkouts = selectedWorkout
    ? [selectedWorkout, ...workouts.filter(workout => workout.id !== selectedWorkoutId)]
    : workouts;

  return (
    <>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Workout history</Text>
      {isLoading ? <Text>Loading workouts…</Text> : error ? <Text>{error}</Text> : (
        <>
          {workouts.length === 0 && <Text>No finished workouts yet.</Text>}
          {workouts.length > 0 && <WorkoutCalendar workouts={workouts} dateFormat={dateFormat}
            selectedWorkoutId={selectedWorkoutId} onSelectWorkout={setSelectedWorkoutId}
            onLongPressWorkout={confirmDelete} />}
          {displayedWorkouts.map(workout => (
            <Pressable key={workout.id} testID={`workout-card-${workout.id}`} accessible={false}
              disabled={isDeleting} onLongPress={() => confirmDelete(workout)}
              style={[styles.card, workout.id === selectedWorkoutId && styles.selectedCard]}>
              <View style={styles.cardHeader}>
                <Text style={styles.name} accessibilityActions={[{ name: 'delete', label: 'Delete workout' }]}
                  onAccessibilityAction={() => confirmDelete(workout)}>
                  {workout.routineName}
                  <Text style={styles.day}> · {workout.trainingDayName}</Text>
                </Text>
                <Text style={styles.date}>{formatWorkoutDate(workout.finishTime, dateFormat)}</Text>
              </View>
              {editingWorkoutId === workout.id && <View style={{ gap: 8 }}>
                <Text>Double-tap a row to edit its weight and reps.</Text>
                <Button title="Add set" onPress={() => setAddingWorkout(workout)} />
                <Button title="Done editing workout" onPress={() => setEditingWorkoutId(null)} />
              </View>}
              {workout.sets.length === 0 ? <Text>No sets completed.</Text> : (
                <WorkoutSetTable showExercise disabled={isDeleting}
                  rows={workout.sets.map((set, index) => ({ id: set.id, exerciseName: set.exerciseName, weight: set.weight, reps: set.reps,
                    isPR: (set.repPrImprovement ?? 0) > 0, excluded: set.excludedFromTracking,
                    comment: index === 0 || workout.sets[index - 1].exerciseName !== set.exerciseName ? set.exerciseComment : undefined }))}
                  onHold={() => confirmDelete(workout)} onEdit={row => {
                    const set = workout.sets.find(set => set.id === row.id);
                    if (set) setEditingSet({ sessionId: workout.id, set });
                  }} />
              )}
              {workout.exerciseNotes?.map((note, index) => <View key={index} style={{ marginTop: 8 }}>
                <Text>{note.exerciseName}</Text>
                <Text>{note.comment}</Text>
              </View>)}
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
    <Modal visible={addingWorkout !== null} transparent animationType="fade" onRequestClose={() => setAddingWorkout(null)}>
      {addingWorkout && <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxHeight: '80%', gap: 16 }}>
          <Text style={{ fontSize: 22 }}>Add a set to which exercise?</Text>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            {[...new Map(addingWorkout.sets.map(set => [set.loggedExerciseId ?? set.exerciseName, set])).values()].map(set =>
              <Button key={set.id} title={set.exerciseName} onPress={() => {
                setEditingSet({ sessionId: addingWorkout.id, set, adding: true });
                setAddingWorkout(null);
              }} />)}
          </ScrollView>
          <Button title="Cancel adding set" onPress={() => setAddingWorkout(null)} />
        </View>
      </View>}
    </Modal>
    {editingSet && <EditLoggedSetModal key={`${editingSet.set.id}-${editingSet.adding ?? false}`} set={editingSet.set} adding={editingSet.adding}
      onClose={() => setEditingSet(null)} onDelete={editingSet.adding ? undefined : async () => {
        await deleteLoggedSet(await initializeDatabase(), editingSet.sessionId, editingSet.set.id);
        await refreshHistory();
      }}
      onSave={async (weight, reps) => {
        const db = await initializeDatabase();
        if (editingSet.adding) await addLoggedSet(db, editingSet.sessionId, editingSet.set.id, weight, reps);
        else await updateLoggedSet(db, editingSet.sessionId, editingSet.set.id, weight, reps);
        await refreshHistory();
      }} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  heading: { fontSize: 24 },
  card: { padding: 16, gap: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
  selectedCard: { borderColor: '#2563eb', borderWidth: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 8 },
  name: { fontSize: 20, flex: 1 },
  day: { fontSize: 14, color: '#4b5563' },
  date: { color: '#4b5563', textAlign: 'right', flexShrink: 0 },
});
