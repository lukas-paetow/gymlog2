import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDateFormat, initializeDatabase, listFinishedWorkouts } from '../database';
import type { FinishedWorkout } from '../database';
import { DEFAULT_DATE_FORMAT, formatWorkoutDate } from '../dateFormat';
import WorkoutCalendar from '../components/WorkoutCalendar';
import type { DateFormat } from '../dateFormat';

export default function WorkoutHistoryScreen() {
  const [workouts, setWorkouts] = useState<FinishedWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>(DEFAULT_DATE_FORMAT);

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Workout history</Text>
      {isLoading ? <Text>Loading workouts…</Text> : error ? <Text>{error}</Text> : (
        <>
          {workouts.length === 0 && <Text>No finished workouts yet.</Text>}
          {workouts.length > 0 && <WorkoutCalendar workouts={workouts} dateFormat={dateFormat} />}
          {workouts.map(workout => (
            <View key={workout.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.name}>
                  {workout.routineName}
                  <Text style={styles.day}> · {workout.trainingDayName}</Text>
                </Text>
                <Text style={styles.date}>{formatWorkoutDate(workout.finishTime, dateFormat)}</Text>
              </View>
              {workout.sets.length === 0 ? <Text>No sets completed.</Text> : (
                <View>
                  <View style={[styles.row, styles.tableHeader]}>
                    <Text style={[styles.exercise, styles.label]}>Exercise</Text>
                    <Text style={[styles.weight, styles.label]}>Weight (kg)</Text>
                    <Text style={[styles.reps, styles.label]}>Reps</Text>
                  </View>
                  {workout.sets.map(set => (
                    <View key={set.id} style={styles.row}>
                      <View style={styles.exercise}>
                        <Text>{set.exerciseName}</Text>
                        <Text style={styles.setLabel}>Set {set.setPosition + 1}</Text>
                      </View>
                      <Text style={styles.weight}>{set.weight ?? '—'}</Text>
                      <Text style={styles.reps}>{set.reps}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  heading: { fontSize: 24 },
  card: { padding: 16, gap: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
  cardHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 8 },
  name: { fontSize: 20, flex: 1 },
  day: { fontSize: 14, color: '#4b5563' },
  date: { color: '#4b5563', textAlign: 'right', flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  tableHeader: { backgroundColor: '#f3f4f6' },
  label: { fontWeight: '600' },
  exercise: { flex: 2 },
  weight: { flex: 1, textAlign: 'right' },
  reps: { width: 40, textAlign: 'right' },
  setLabel: { fontSize: 12, color: '#6b7280' },
});
