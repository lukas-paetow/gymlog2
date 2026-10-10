import { ScrollView, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getLoggedSession, initializeDatabase, listExercisesInTrainingDay } from '../database';
import type { TrainingDayExercise } from '../database';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSession'>;

export default function ActiveSessionScreen({ route }: Props) {
  const { sessionId } = route.params; // braces unpack field from object route.params here. it's like route.params.sessionId
  const [dayName, setDayName] = useState('');
  const [exercises, setExercises] = useState<TrainingDayExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayDeleted, setDayDeleted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDay() {
      setIsLoading(true);
      setError(null);
      setExercises([]);
      setDayDeleted(false);

      try {
        const db = await initializeDatabase();
        const session = await getLoggedSession(db, sessionId);
        if (!session) throw new Error('Session not found');

        const rows = session.trainingDayId === null
          ? []
          : await listExercisesInTrainingDay(db, session.trainingDayId);

        if (!cancelled) {
          setDayName(session.trainingDayName);
          setExercises(rows);
          setDayDeleted(session.trainingDayId === null);
        }
      } catch (cause) {
        console.error('Loading active session failed:', cause);
        if (!cancelled) setError('Could not load the training day.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadDay();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
      {isLoading ? (
        <Text>Loading training day…</Text>
      ) : error !== null ? (
        <Text>{error}</Text>
      ) : (
        <>
          <Text style={{ fontSize: 24 }}>{dayName}</Text>
          <Text>Planned exercises</Text>
          {dayDeleted && <Text>The original training day has been deleted.</Text>}
          {!dayDeleted && exercises.length === 0 && <Text>No planned exercises.</Text>}
          {exercises.map(exercise => (
            <View key={exercise.id} style={{ padding: 16, borderWidth: 1, borderColor: '#ccc' }}>
              <Text style={{ fontSize: 20 }}>{exercise.name}</Text>
              <Text>{exercise.prescribedSets} prescribed sets</Text>
              {exercise.prescribedWeightFirstSet !== null && (
                <Text>Starting weight: {exercise.prescribedWeightFirstSet} kg</Text>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
