import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react'; import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getLoggedSession, initializeDatabase, listExercisesInTrainingDay } from '../database';
import type { TrainingDayExercise } from '../database';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSession'>;
type SetDraft = { reps: number | null; weight: string };

export default function ActiveSessionScreen({ route }: Props) {
  const { sessionId } = route.params; // braces unpack field from object route.params here. it's like route.params.sessionId
  const [dayName, setDayName] = useState('');
  const [exercises, setExercises] = useState<TrainingDayExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayDeleted, setDayDeleted] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [setDrafts, setSetDrafts] = useState<Record<number, SetDraft[]>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadDay() {
      setIsLoading(true);
      setError(null);
      setExercises([]);
      setDayDeleted(false);
      setExpandedExerciseId(null);
      setSetDrafts({});

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
          setSetDrafts(Object.fromEntries(rows.map(exercise => [
            exercise.id,
            Array.from({ length: exercise.prescribedSets }, (_, index) => ({
              reps: index === 0 ? exercise.prescribedRepsFirstSet : null,
              weight: index === 0 && exercise.prescribedWeightFirstSet !== null
                ? String(exercise.prescribedWeightFirstSet) : '',
            })),
          ])));
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

  function updateSet(exerciseId: number, index: number, changes: Partial<SetDraft>) {
    setSetDrafts(current => ({
      ...current,
      [exerciseId]: current[exerciseId].map((set, position) =>
        position === index ? { ...set, ...changes } : set
      ),
    }));
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      {isLoading ? (
        <Text>Loading training day…</Text>
      ) : error !== null ? (
        <Text>{error}</Text>
      ) : (
        <>
          <Text style={{ fontSize: 24 }}>{dayName}</Text>
          {dayDeleted && <Text>The original training day has been deleted.</Text>}
          {!dayDeleted && exercises.length === 0 && <Text>No planned exercises.</Text>}

          {exercises.map(exercise => (
            <View
              key={exercise.id}
              style={{
                padding: expandedExerciseId === exercise.id ? 20 : 16,
                marginHorizontal: expandedExerciseId === exercise.id ? -4 : 0,
                borderWidth: 1,
                borderColor: expandedExerciseId === exercise.id ? '#2563eb' : '#ccc',
                backgroundColor: expandedExerciseId === exercise.id ? '#eff6ff' : '#fff',
                opacity: expandedExerciseId !== null && expandedExerciseId !== exercise.id ? 0.6 : 1,
                borderRadius: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={exercise.name}
                accessibilityState={{ expanded: expandedExerciseId === exercise.id }}
                onPress={() => setExpandedExerciseId(current =>
                  current === exercise.id ? null : exercise.id
                )}
              >
              <Text style={{ fontSize: 20 }}>{exercise.name}</Text>
              <Text>{exercise.prescribedSets} prescribed sets</Text>
              <Text>First-set reps: {exercise.prescribedRepsFirstSet}</Text>
              {exercise.prescribedWeightFirstSet !== null && (
                <Text>First-set weight: {exercise.prescribedWeightFirstSet} kg</Text>
              )}
              </Pressable>
              {expandedExerciseId === exercise.id && (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {(setDrafts[exercise.id] ?? []).map((set, index) => (
                    <View key={index} style={{ borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 12 }}>
                      <Text>Set {index + 1}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ flex: 1 }}>
                          <Text>Reps: {set.reps ?? '—'}</Text>
                          <Slider
                            style={{ height: 40 }}
                            minimumValue={0}
                            maximumValue={Math.max(30, exercise.prescribedRepsFirstSet)}
                            step={1}
                            value={set.reps ?? 0}
                            minimumTrackTintColor="#2563eb"
                            thumbTintColor="#2563eb"
                            accessibilityLabel={`${exercise.name}, set ${index + 1} reps`}
                            onValueChange={reps => updateSet(exercise.id, index, { reps })}
                          />
                        </View>
                        <View style={{ width: 100 }}>
                          <Text>Weight (kg)</Text>
                          <TextInput
                            style={{ borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 10, backgroundColor: '#fff' }}
                            keyboardType="decimal-pad"
                            placeholder="—"
                            value={set.weight}
                            accessibilityLabel={`${exercise.name}, set ${index + 1} weight in kilograms`}
                            onChangeText={weight => updateSet(exercise.id, index, { weight })}
                          />
                        </View>
                      </View>
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
