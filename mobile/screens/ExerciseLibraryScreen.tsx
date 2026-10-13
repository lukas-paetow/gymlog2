import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { initializeDatabase, listExercisesWithRecords } from '../database';
import type { ExerciseWithRecord } from '../database';

export default function ExerciseLibraryScreen() {
  const [exercises, setExercises] = useState<ExerciseWithRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // reloads also upon returning to this screen as opposed to useEffect
  useFocusEffect(useCallback(() => { // usecallback makes function reference stable
    let cancelled = false;

    async function loadRecords() {
      setIsLoading(true);
      setError(null);
      try {
        const db = await initializeDatabase();
        const rows = await listExercisesWithRecords(db);
        if (!cancelled) setExercises(rows);
      } catch (cause) {
        console.error('Loading exercise records failed:', cause);
        if (!cancelled) setError('Could not load exercise records.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadRecords();
    return () => { cancelled = true; }; // we return this function without executing it. this happens upon unmounting or losing screen focus. so no vis updates out of focus
  }, []));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Exercise library</Text>
      {isLoading ? <Text>Loading records…</Text> : error ? <Text>{error}</Text> : (
        <>
          {exercises.length === 0 && <Text>No exercises yet. Add one when creating a routine.</Text>}
          {exercises.map(exercise => (
            <View key={exercise.id} style={styles.card}>
              <Text style={styles.name}>{exercise.name}</Text>
              {exercise.heaviestWeight === null ? <Text>No record yet.</Text> : (
                <>
                  <Text>Personal Record: {exercise.heaviestWeight} kg / {exercise.repsAtHeaviestWeight} reps</Text>
                </>
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
  card: { padding: 16, gap: 6, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
  name: { fontSize: 20 },
});
