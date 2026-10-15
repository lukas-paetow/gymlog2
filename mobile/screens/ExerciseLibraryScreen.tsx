import { Alert, Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { deleteExercise, initializeDatabase, listExercisesWithRecords } from '../database';
import type { ExerciseWithRecord } from '../database';

export default function ExerciseLibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [exercises, setExercises] = useState<ExerciseWithRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingRef = useRef(false);

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

  async function removeExercise(exerciseId: number) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    try {
      const db = await initializeDatabase();
      await deleteExercise(db, exerciseId);
      setExercises(current => current.filter(exercise => exercise.id !== exerciseId));
    } catch (cause) {
      console.error('Deleting library exercise failed:', cause);
      Alert.alert('Delete failed', 'Could not delete the exercise. Please try again.');
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  function confirmDelete(exercise: ExerciseWithRecord) {
    Alert.alert('Delete exercise?',
      `Remove "${exercise.name}" from the library and all training-day plans? Saved workout history will be kept.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeExercise(exercise.id) },
      ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Exercise library</Text>
      {isLoading ? <Text>Loading records…</Text> : error ? <Text>{error}</Text> : (
        <>
          {exercises.length === 0 && <Text>No exercises yet. Add one when creating a routine.</Text>}
          {exercises.map(exercise => (
            <Pressable key={exercise.id} style={styles.card} accessibilityRole="button"
              accessibilityLabel={`View progress for ${exercise.name}`}
              accessibilityHint="Hold to open exercise progress"
              accessibilityActions={[{ name: 'activate', label: 'View progress' }]}
              onAccessibilityAction={() => navigation.navigate('Progress', { exerciseId: exercise.id, exerciseName: exercise.name })}
              onLongPress={() => navigation.navigate('Progress', { exerciseId: exercise.id, exerciseName: exercise.name })}>
              <View style={styles.cardHeader}>
                <Text style={styles.name}>{exercise.name}</Text>
                <Button title="X" accessibilityLabel={`Delete ${exercise.name}`} color="#b91c1c"
                  disabled={isDeleting} onPress={() => confirmDelete(exercise)} />
              </View>
              {exercise.heaviestWeight === null ? <Text>No record yet.</Text> : (
                <>
                  <Text>Personal Record: {exercise.heaviestWeight} kg / {exercise.repsAtHeaviestWeight} reps</Text>
                </>
              )}
            </Pressable>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 20, flex: 1 },
});
