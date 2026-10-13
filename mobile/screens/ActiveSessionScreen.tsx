import { Alert, Button, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Fragment, useEffect, useRef, useState } from 'react'; import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getLoggedSession, initializeDatabase, listExercisesInTrainingDay, saveCompletedSet } from '../database';
import type { TrainingDayExercise } from '../database';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSession'>;
type SetDraft = { reps: number | null; weight: string; completed: boolean };

export default function ActiveSessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params; // braces unpack field from object route.params here. it's like route.params.sessionId
  const [dayName, setDayName] = useState('');
  const [exercises, setExercises] = useState<TrainingDayExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayDeleted, setDayDeleted] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [setDrafts, setSetDrafts] = useState<Record<number, SetDraft[]>>({}); // number is like a lookup key, an ID for the setDraft
  const [completedExerciseIds, setCompletedExerciseIds] = useState<number[]>([]);
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<number[]>([]);
  const [isSavingSet, setIsSavingSet] = useState(false);
  const savingSetRef = useRef(false); // Block repeat presses immediately, before React rerenders.
  const [exercisePositions, setExercisePositions] = useState<Record<number, number>>({});

  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDay() {
      setIsLoading(true);
      setError(null);
      setExercises([]);
      setDayDeleted(false);
      setExpandedExerciseId(null);
      setSetDrafts({});
      setCompletedExerciseIds([]);
      setSkippedExerciseIds([]);
      setIsFinished(false);
      setExercisePositions({});

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
          setSetDrafts(Object.fromEntries(rows.map(exercise => [ // exercise.id and array of data pair becomes object
            exercise.id,
            Array.from({ length: exercise.prescribedSets }, (_, index) => ({
              completed: false,
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

  function updateSet(exerciseId: number, index: number, changes: Partial<Pick<SetDraft, 'reps' | 'weight'>>) { // Partial Pick allows one or the other, optional
    if (savingSetRef.current || isFinished || completedExerciseIds.includes(exerciseId) || skippedExerciseIds.includes(exerciseId)) return;
    setSetDrafts(current => {
      const sets = current[exerciseId];
      if (!sets || sets.findIndex(set => !set.completed) !== index) return current;
      return {
        ...current,
        [exerciseId]: sets.map((set, position) => // use value of exerciseId as property name. might be like "12" here
          position === index ? { ...set, ...changes } : set
        ),
      };
    });
  }

  async function completeSet(exerciseId: number, index: number) {
    if (savingSetRef.current || isFinished || completedExerciseIds.includes(exerciseId) || skippedExerciseIds.includes(exerciseId)) return;
    const sets = setDrafts[exerciseId];
    if (!sets || sets.findIndex(set => !set.completed) !== index) return;
    const set = sets[index];
    const weight = Number(set.weight.trim().replace(',', '.'));
    if (set.reps === null || !Number.isInteger(set.reps) || set.reps < 1
      || !set.weight.trim() || !Number.isFinite(weight)) {
      Alert.alert('Set incomplete', 'Choose at least one rep and enter a valid weight (negative values mean assistance).');
      return;
    }
    const exercise = exercises.find(item => item.id === exerciseId);
    if (!exercise) return;
    const workoutExercisePosition = exercisePositions[exerciseId]
      ?? Object.keys(exercisePositions).length;

    savingSetRef.current = true;
    setIsSavingSet(true);
    try {
      const db = await initializeDatabase();
      await saveCompletedSet(db, sessionId, exercise, workoutExercisePosition, index, set.reps, weight);
      setExercisePositions(current => ({ ...current, [exerciseId]: workoutExercisePosition }));
      setSetDrafts(current => ({
        ...current,
        [exerciseId]: current[exerciseId].map((item, position) =>
          position === index ? { ...item, completed: true } : item
        ),
      }));
    } catch (cause) {
      console.error('Saving set failed:', cause);
      Alert.alert('Save failed', 'The set was not marked completed. Please try again.');
    } finally {
      savingSetRef.current = false;
      setIsSavingSet(false);
    }
  }

  function completeExercise(exerciseId: number) {
    if (savingSetRef.current || isFinished || completedExerciseIds.includes(exerciseId) || skippedExerciseIds.includes(exerciseId)) return;
    if (!setDrafts[exerciseId]?.some(set => set.completed)) {
      setSkippedExerciseIds(current =>
        current.includes(exerciseId) ? current : [...current, exerciseId]
      );
      setExpandedExerciseId(current => current === exerciseId ? null : current);
      return;
    }
    setCompletedExerciseIds(current =>
      current.includes(exerciseId) ? current : [...current, exerciseId]
    );
    setExpandedExerciseId(current => current === exerciseId ? null : current);
  }

  function finishWorkout() {
    if (savingSetRef.current || isFinished) return;
    Alert.alert('Finish workout?', 'Finish now? Uncompleted sets will be left out of the summary.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finish', onPress: () => {
        if (savingSetRef.current) return;
        setExpandedExerciseId(null);
        setIsFinished(true);
      } },
    ]);
  }

  function closeSummary() {
    navigation.popTo('Session');
  }

  const performedExercises = exercises.filter(exercise =>
    setDrafts[exercise.id]?.some(set => set.completed)
  );
  const completedSetCount = performedExercises.reduce((total, exercise) =>
    total + setDrafts[exercise.id].filter(set => set.completed).length, 0
  );

  // Keep training-day order within the completed and unfinished groups.
  // these don't need useState because they derive from quantities saved 
  const visibleExercises = exercises.filter(exercise => !skippedExerciseIds.includes(exercise.id));
  const completedExercises = visibleExercises.filter(exercise => completedExerciseIds.includes(exercise.id));
  const displayedExercises = [
    ...completedExercises,
    ...visibleExercises.filter(exercise => !completedExerciseIds.includes(exercise.id)),
  ];

  return (
    <>
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
          {!dayDeleted && exercises.length > 0 && displayedExercises.length === 0 && (
            <Text>All exercises have been skipped.</Text>
          )}

          {completedExercises.length > 0 && (
            <Text style={{ fontSize: 16, color: '#6b7280' }}>Completed</Text>
          )}
          {displayedExercises.map((exercise, index) => (
            <Fragment key={exercise.id}>
              {index === completedExercises.length && (
                <View style={{
                  borderTopWidth: completedExercises.length > 0 ? 2 : 0,
                  borderColor: '#94a3b8',
                  paddingTop: completedExercises.length > 0 ? 16 : 0,
                }}>
                  <Text style={{ fontSize: 16 }}>Remaining exercises:</Text>
                </View>
              )}
            <View
              style={{
                padding: expandedExerciseId === exercise.id ? 20 : 16,
                marginHorizontal: expandedExerciseId === exercise.id ? -4 : 0,
                borderWidth: 1,
                borderColor: completedExerciseIds.includes(exercise.id) ? '#d1d5db'
                  : expandedExerciseId === exercise.id ? '#2563eb' : '#ccc',
                backgroundColor: completedExerciseIds.includes(exercise.id) ? '#e5e7eb'
                  : expandedExerciseId === exercise.id ? '#eff6ff' : '#fff',
                opacity: completedExerciseIds.includes(exercise.id) ? 0.7
                  : expandedExerciseId !== null && expandedExerciseId !== exercise.id ? 0.6 : 1,
                borderRadius: 8,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Pressable
                  style={{ flex: 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={exercise.name}
                  disabled={isSavingSet || isFinished || completedExerciseIds.includes(exercise.id)}
                  accessibilityState={{
                    expanded: expandedExerciseId === exercise.id,
                    disabled: isSavingSet || isFinished || completedExerciseIds.includes(exercise.id),
                  }}
                  onPress={() => setExpandedExerciseId(current =>
                    current === exercise.id ? null : exercise.id
                  )}
                  delayLongPress={500}
                  onLongPress={() => {
                    if (setDrafts[exercise.id]?.some(set => set.completed)) return;
                    Alert.alert(exercise.name, undefined, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Skip exercise', onPress: () => completeExercise(exercise.id) },
                    ]);
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{exercise.name}</Text>
                  {completedExerciseIds.includes(exercise.id) ? (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {(setDrafts[exercise.id] ?? []).map((set, index) => set.completed && (
                        <Text key={index} style={{ fontSize: 12, color: '#374151' }}>
                          Set {index + 1}: {set.reps} reps × {set.weight.trim().replace(',', '.')} kg
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <>
                      <Text>{exercise.prescribedSets} prescribed sets</Text>
                      <Text>First-set reps: {exercise.prescribedRepsFirstSet}</Text>
                      {exercise.prescribedWeightFirstSet !== null && (
                        <Text>First-set weight: {exercise.prescribedWeightFirstSet} kg</Text>
                      )}
                    </>
                  )}
                </Pressable>
                {setDrafts[exercise.id]?.some(set => set.completed) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Complete ${exercise.name}`}
                  accessibilityState={{ disabled: isSavingSet || isFinished || completedExerciseIds.includes(exercise.id) }}
                  disabled={isSavingSet || isFinished || completedExerciseIds.includes(exercise.id)}
                  onPress={() => completeExercise(exercise.id)}
                  style={({ pressed }) => ({
                    width: 100,
                    paddingVertical: 9,
                    borderRadius: 6,
                    backgroundColor: completedExerciseIds.includes(exercise.id) ? '#6b7280' : '#2563eb',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>
                    {completedExerciseIds.includes(exercise.id) ? 'Completed'
                      : 'Complete exercise'}
                  </Text>
                </Pressable>
                )}
              </View>
              {!completedExerciseIds.includes(exercise.id) && expandedExerciseId === exercise.id && (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {(setDrafts[exercise.id] ?? []).map((set, index, sets) => {
                    const isEditable = !isSavingSet && !isFinished && !completedExerciseIds.includes(exercise.id)
                      && index === sets.findIndex(item => !item.completed);
                    return (
                      <View key={index} style={{ borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 12, opacity: isEditable ? 1 : 0.5 }}>
                        <Text>Set {index + 1}{set.completed ? ' — Completed' : !isEditable ? ' — Locked' : ''}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <Text>Reps: {set.reps ?? '—'}</Text>
                            <Slider
                              disabled={!isEditable}
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
                              editable={isEditable}
                              style={{ borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 10, backgroundColor: '#fff' }}
                              keyboardType="decimal-pad"
                              placeholder="—"
                              value={set.weight}
                              accessibilityLabel={`${exercise.name}, set ${index + 1} weight in kilograms`}
                              onChangeText={weight => updateSet(exercise.id, index, { weight })}
                            />
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Complete ${exercise.name}, set ${index + 1}`}
                              accessibilityState={{ disabled: !isEditable }}
                              disabled={!isEditable}
                              onPress={() => completeSet(exercise.id, index)}
                              style={({ pressed }) => ({
                                width: '100%',
                                marginTop: 16,
                                paddingVertical: 9,
                                borderRadius: 6,
                                backgroundColor: isEditable ? '#2563eb' : '#94a3b8',
                                opacity: pressed ? 0.8 : 1,
                              })}
                            >
                              <Text style={{ color: '#fff', fontSize: 12, textAlign: 'center' }}>
                                {set.completed ? 'Completed' : isSavingSet ? 'Saving…' : 'Complete set'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            </Fragment>
          ))}
          <View style={{ marginTop: 24, marginBottom: 20 }}>
            <Button title="Finish workout" onPress={finishWorkout} disabled={isSavingSet || isFinished} />
          </View>
        </>
      )}
    </ScrollView>
    <Modal visible={isFinished} transparent animationType="fade" onRequestClose={closeSummary}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxHeight: '85%', gap: 16 }}>
          <Text style={{ fontSize: 24 }}>Workout finished</Text>
          <Text style={{ fontSize: 18 }}>{dayName}</Text>
          <Text>{performedExercises.length} exercises · {completedSetCount} completed sets</Text>
          <ScrollView contentContainerStyle={{ gap: 16 }}>
            {performedExercises.length === 0 && <Text>No exercises completed.</Text>}
            {performedExercises.map(exercise => (
              <View key={exercise.id} style={{ gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{exercise.name}</Text>
                {setDrafts[exercise.id].map((set, index) => set.completed && (
                  <Text key={index}>
                    Set {index + 1}: {set.reps} reps × {set.weight.trim().replace(',', '.')} kg
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
          <Button title="Done" onPress={closeSummary} />
        </View>
      </View>
    </Modal>
    </>
  );
}
