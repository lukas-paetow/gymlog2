import { Alert, Button, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import RepSlider from '../components/RepSlider';
import AddWorkoutExercise from '../components/AddWorkoutExercise';
import WorkoutSetTable from '../components/WorkoutSetTable';
import { Fragment, useEffect, useRef, useState } from 'react'; import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { listExerciseNotes, finishLoggedSession, getLoggedSession, initializeDatabase, listExercisesInTrainingDay, getExerciseWeightOptions, listLastSetWeights, listSetRepRecords, getProgressionMode, listExerciseAnnotations, saveExerciseAnnotation, listSavedSessionSets, saveCompletedSet } from '../database';
import type { ProgressionMode } from '../database';
import { inferWeightOptions } from '../weightOptions';
import type { WeightOptions } from '../weightOptions';
import ExerciseOptionsModal from '../components/ExerciseOptionsModal';
import ExerciseNoteModal from '../components/ExerciseNoteModal';
import ExerciseHistoryModal from '../components/ExerciseHistoryModal';
import WeightPicker from '../components/WeightPicker';
import PersonalRecordCelebration from '../components/PersonalRecordCelebration';
import type { Exercise, ExerciseAnnotation, LastSetReps, LastSetWeight, TrainingDayExercise } from '../database';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSession'>;
type SetDraft = { reps: number | null; weight: string; completed: boolean; rememberWeight?: boolean; isPersonalRecord?: boolean; isSubmaximalRecord?: boolean };

export default function ActiveSessionScreen({ route, navigation }: Props) {
  const [isWeightInteracting, setIsWeightInteracting] = useState(false);
  const [progression, setProgression] = useState<ProgressionMode>('hypertrophy');
  const { sessionId } = route.params; // braces unpack field from object route.params here. it's like route.params.sessionId
  const [dayName, setDayName] = useState('');
  const [setupNotes, setSetupNotes] = useState<Record<number, string>>({});
  const [exerciseWeights, setExerciseWeights] = useState<Record<number, WeightOptions>>({});
  const [lastSetReps, setLastSetReps] = useState<LastSetReps[]>([]);
  const [lastSetWeights, setLastSetWeights] = useState<LastSetWeight[]>([]);
  const [exercises, setExercises] = useState<TrainingDayExercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayDeleted, setDayDeleted] = useState(false);
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [setDrafts, setSetDrafts] = useState<Record<number, SetDraft[]>>({}); // number is like a lookup key, an ID for the setDraft
  const [completedExerciseIds, setCompletedExerciseIds] = useState<number[]>([]);
  const [skippedExerciseIds, setSkippedExerciseIds] = useState<number[]>([]);
  const [annotations, setAnnotations] = useState<Record<number, ExerciseAnnotation>>({});
  const [options, setOptions] = useState<{ exercise: TrainingDayExercise; mode: 'comment' | 'tracking' } | null>(null);
  const [menuExercise, setMenuExercise] = useState<TrainingDayExercise | null>(null);
  const [noteExercise, setNoteExercise] = useState<TrainingDayExercise | null>(null);
  const [historyExercise, setHistoryExercise] = useState<TrainingDayExercise | null>(null);
  const [recordCount, setRecordCount] = useState(0);
  const [isSavingSet, setIsSavingSet] = useState(false);
  const savingSetRef = useRef(false); // Block repeat presses immediately, before React rerenders.
  const [exercisePositions, setExercisePositions] = useState<Record<number, number>>({});

  const [isFinished, setIsFinished] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isAddingExercise, setIsAddingExercise] = useState(false);
  const isBusy = isSavingSet || isFinishing || isAddingExercise;

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
      setRecordCount(0);
      setOptions(null);
      setMenuExercise(null);
      setHistoryExercise(null);
      setAnnotations({});

      try {
        const db = await initializeDatabase();
        const notes = await listExerciseNotes(db);
        const session = await getLoggedSession(db, sessionId);
        if (!session) throw new Error('Session not found');

        const planned = session.trainingDayId === null
          ? [] : await listExercisesInTrainingDay(db, session.trainingDayId);
        const savedSets = await listSavedSessionSets(db, sessionId);
        const rows: TrainingDayExercise[] = [];
        const drafts: Record<number, SetDraft[]> = {};
        const positions: Record<number, number> = {};
        const readOnlyIds: number[] = [];

        function addDrafts(exercise: TrainingDayExercise, count: number) {
          drafts[exercise.id] = Array.from({ length: count }, (_, index) => ({
            completed: false,
            reps: index === 0 ? exercise.prescribedRepsFirstSet : null,
            weight: index === 0 && exercise.prescribedWeightFirstSet !== null
              ? String(exercise.prescribedWeightFirstSet) : '',
          }));
        }

        // Saved snapshots override a plan that may have changed since starting.
        for (const saved of savedSets) {
          const id = saved.exerciseId ?? -saved.loggedExerciseId;
          if (!drafts[id]) {
            const exercise: TrainingDayExercise = {
              id, name: saved.name, prescribedSets: saved.prescribedSets,
              prescribedWeightFirstSet: saved.prescribedWeightFirstSet ?? 0,
              prescribedRepsFirstSet: saved.prescribedRepsFirstSet,
            };
            rows.push(exercise);
            addDrafts(exercise, Math.max(saved.prescribedSets, saved.setPosition + 1));
            positions[id] = saved.position;
            if (saved.exerciseId === null) readOnlyIds.push(id);
          }
          while (drafts[id].length <= saved.setPosition) {
            drafts[id].push({ completed: false, reps: null, weight: '' });
          }
          drafts[id][saved.setPosition] = {
            completed: true, reps: saved.reps,
            isPersonalRecord: saved.recordKind === 'pr',
            isSubmaximalRecord: saved.recordKind === 'submaximal',
            weight: saved.weight === null ? '' : String(saved.weight),
          };
        }
        for (const exercise of planned) {
          if (!drafts[exercise.id]) {
            rows.push(exercise);
            addDrafts(exercise, exercise.prescribedSets);
          }
        }

        const savedAnnotations = await listExerciseAnnotations(db, sessionId);
        for (const note of savedAnnotations) {
          if (!drafts[note.id]) {
            rows.push(note);
            addDrafts(note, note.prescribedSets);
            if (note.exerciseId === null) readOnlyIds.push(note.id);
          }
        }
        const lastWeights = await listLastSetWeights(db, sessionId);
        for (const last of lastWeights) {
          const draft = drafts[last.exerciseId]?.[last.setPosition];
          if (draft && !draft.completed) draft.weight = String(last.weight);
        }
        const [lastReps, mode] = await Promise.all([listSetRepRecords(db, sessionId), getProgressionMode(db)]);
        for (const exercise of rows) {
          drafts[exercise.id].forEach((draft, index) => {
            if (!draft.completed && draft.weight.trim()) {
              const record = lastReps.find(last => last.exerciseId === exercise.id && last.setPosition === index
                && last.weight === Number(draft.weight));
              if (record) draft.reps = record.reps + (index === 0 && mode === 'hypertrophy' ? 1 : 0);
            }
          });
        }
        const weightOptions = await Promise.all(rows.map(async exercise => {
          const configured = await getExerciseWeightOptions(db, exercise.id);
          if (configured.weights.length > 1 || configured.increments.length) return configured;
          const logged = [...configured.weights, ...[...lastReps, ...lastWeights].filter(row => row.exerciseId === exercise.id).map(row => row.weight)];
          return inferWeightOptions(logged.length ? logged : [exercise.prescribedWeightFirstSet]);
        }));
        if (!cancelled) {
          setSetupNotes(Object.fromEntries(notes.map(note => [note.exerciseId, note.note])));
          setLastSetWeights(lastWeights);
          setProgression(mode);
          setLastSetReps(lastReps);
          setAnnotations(Object.fromEntries(savedAnnotations.map(note => [note.id, note])));
          setExerciseWeights(Object.fromEntries(rows.map((exercise, index) => [exercise.id, weightOptions[index]])));
          setDayName(session.trainingDayName);
          setExercises(rows);
          setSetDrafts(drafts);
          setExercisePositions(positions);
          setCompletedExerciseIds(rows.filter(exercise =>
            readOnlyIds.includes(exercise.id) || drafts[exercise.id].every(set => set.completed)
          ).map(exercise => exercise.id));
          setIsFinished(session.finishTime !== null);
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

  function openExerciseMenu(exercise: TrainingDayExercise) {
    setMenuExercise(exercise);
  }

  async function addUnplannedExercise(libraryExercise: Exercise) {
    if (isBusy || isFinished || exercises.some(exercise => exercise.id === libraryExercise.id)) return;
    setIsAddingExercise(true);
    try {
      const id = libraryExercise.id;
      const lastWeight = lastSetWeights.find(row => row.exerciseId === id && row.setPosition === 0)?.weight;
      const record = lastSetReps.find(row => row.exerciseId === id && row.setPosition === 0 && row.weight === lastWeight);
      const reps = record ? record.reps + (progression === 'hypertrophy' ? 1 : 0) : 8;
      const exercise: TrainingDayExercise = { ...libraryExercise, prescribedSets: 1,
        prescribedWeightFirstSet: lastWeight ?? 0, prescribedRepsFirstSet: reps };
      let configured = await getExerciseWeightOptions(await initializeDatabase(), id);
      if (configured.weights.length <= 1 && !configured.increments.length) {
        const logged = [...configured.weights, ...[...lastSetReps, ...lastSetWeights].filter(row => row.exerciseId === id).map(row => row.weight)];
        configured = inferWeightOptions(logged.length ? logged : [lastWeight ?? 0]);
      }
      setExerciseWeights(current => ({ ...current, [id]: configured }));
      setSetDrafts(current => ({ ...current, [id]: [{ completed: false, reps, weight: lastWeight === undefined ? '' : String(lastWeight) }] }));
      setExercises(current => [...current, exercise]);
      setExpandedExerciseId(id);
    } finally { setIsAddingExercise(false); }
  }

  function updateSet(exerciseId: number, index: number, changes: Partial<Pick<SetDraft, 'reps' | 'weight' | 'rememberWeight'>>) { // Partial Pick allows one or the other, optional
    if (savingSetRef.current || isFinished || completedExerciseIds.includes(exerciseId) || skippedExerciseIds.includes(exerciseId)) return;
    setSetDrafts(current => {
      const sets = current[exerciseId];
      if (!sets || sets.findIndex(set => !set.completed) !== index) return current;
      let defaults: Partial<SetDraft> = {};
      if (changes.weight !== undefined && (!sets[index].weight.trim()
        || Number(changes.weight.replace(',', '.')) !== Number(sets[index].weight.replace(',', '.')))) {
        const weight = changes.weight.trim() ? Number(changes.weight.replace(',', '.')) : NaN;
        const record = lastSetReps.find(last => last.exerciseId === exerciseId && last.setPosition === index && last.weight === weight);
        defaults = { reps: record ? record.reps + (index === 0 && progression === 'hypertrophy' ? 1 : 0) : sets[index].reps };
      }
      return {
        ...current,
        [exerciseId]: sets.map((set, position) => // use value of exerciseId as property name. might be like "12" here
          position === index ? { ...set, ...defaults, ...changes } : set
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
      ?? Math.max(-1, ...Object.values(exercisePositions)) + 1;

    savingSetRef.current = true;
    setIsSavingSet(true);
    try {
      const db = await initializeDatabase();
      const result = await saveCompletedSet(db, sessionId, exercise, workoutExercisePosition, index, set.reps, weight, set.rememberWeight ?? false);
      if (set.rememberWeight) {
        setExerciseWeights(current => {
          const profile = current[exerciseId] ?? { weights: [], increments: [] };
          return { ...current, [exerciseId]: { ...profile, weights: [...new Set([...profile.weights, weight])].sort((a, b) => a - b) } };
        });
      }
      if (result.isPersonalRecord) {
        setRecordCount(current => current + 1);
      }
      if (result.prescribedReps !== undefined) {
        const nextReps = result.prescribedReps;
        setExercises(current => current.map(item => item.id === exerciseId
          ? { ...item, prescribedRepsFirstSet: nextReps } : item));
      }
      setExercisePositions(current => ({ ...current, [exerciseId]: workoutExercisePosition }));
      setSetDrafts(current => ({
        ...current,
        [exerciseId]: current[exerciseId].map((item, position) =>
          position === index ? { ...item, completed: true, isPersonalRecord: result.isPersonalRecord, isSubmaximalRecord: result.isSubmaximalRecord } : item
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
      { text: 'Finish', onPress: confirmFinishWorkout },
    ]);
  }

  /** Show the summary only after SQLite has saved the finish timestamp. */
  async function confirmFinishWorkout() {
    if (savingSetRef.current || isFinished) return;
    savingSetRef.current = true;
    setIsFinishing(true);
    try {
      const db = await initializeDatabase();
      await finishLoggedSession(db, sessionId);
      setExpandedExerciseId(null);
      setIsFinished(true);
    } catch (cause) {
      console.error('Finishing workout failed:', cause);
      Alert.alert('Finish failed', 'Could not finish the workout. Please try again.');
    } finally {
      savingSetRef.current = false;
      setIsFinishing(false);
    }
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
    <ScrollView scrollEnabled={!isWeightInteracting} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      {isLoading ? (
        <Text>Loading training day…</Text>
      ) : error !== null ? (
        <Text>{error}</Text>
      ) : (
        <>
          <Text style={{ fontSize: 24 }}>{dayName}</Text>
          {dayDeleted && <Text>The original training day has been deleted. Saved exercises are shown below.</Text>}
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
            <Pressable accessible={false} disabled={isBusy || isFinished || exercise.id < 0}
              onLongPress={() => openExerciseMenu(exercise)}
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
                  disabled={isBusy || isFinished || exercise.id < 0}
                  accessibilityState={{
                    expanded: expandedExerciseId === exercise.id,
                    disabled: isBusy || isFinished || exercise.id < 0,
                  }}
                  onPress={() => {
                    if (!completedExerciseIds.includes(exercise.id)) setExpandedExerciseId(current => current === exercise.id ? null : exercise.id);
                  }}
                  delayLongPress={500}
                  onLongPress={() => openExerciseMenu(exercise)}
                >
                  <Text style={{ fontSize: 20 }}>{exercise.name}</Text>
                  {completedExerciseIds.includes(exercise.id) ? (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {(setDrafts[exercise.id] ?? []).map((set, index) => set.completed && (
                        <Text key={index} style={{ fontSize: 12, color: '#374151' }}>
                           {set.weight.trim().replace(',', '.')} kg ×  {set.reps} reps {annotations[exercise.id]?.excludeAll || annotations[exercise.id]?.excludedPositions.includes(index) ? ' — Excluded from PRs and plots' : ''}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <>
                      <Text>{exercise.prescribedSets} sets</Text>
                      {exercise.prescribedWeightFirstSet !== null && (
                      <Text>{exercise.prescribedWeightFirstSet} kg {exercise.prescribedRepsFirstSet} reps
                      </Text>
                      )}
                    </>
                  )}
                </Pressable>
                {setDrafts[exercise.id]?.some(set => set.completed) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Complete ${exercise.name}`}
                  accessibilityState={{ disabled: isBusy || isFinished || completedExerciseIds.includes(exercise.id) || expandedExerciseId !== exercise.id }}
                  disabled={isBusy || isFinished || completedExerciseIds.includes(exercise.id) || expandedExerciseId !== exercise.id}
                  onPress={() => completeExercise(exercise.id)}
                  style={({ pressed }) => ({
                    width: 100,
                    paddingVertical: 9,
                    borderRadius: 6,
                    backgroundColor: completedExerciseIds.includes(exercise.id) ? '#6b7280' : expandedExerciseId !== exercise.id ? '#94a3b8' : '#2563eb',
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
              {!!setupNotes[exercise.id] && <Text style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{setupNotes[exercise.id]}</Text>}
              {!!annotations[exercise.id]?.comment && <Text style={{ marginTop: 8 }}>{annotations[exercise.id].comment}</Text>}
              {annotations[exercise.id]?.excludeAll && <Text>All sets excluded from PRs and plots</Text>}
              {!completedExerciseIds.includes(exercise.id) && expandedExerciseId === exercise.id && (
                <View style={{ marginTop: 12, gap: 12 }}>
                  {(setDrafts[exercise.id] ?? []).map((set, index, sets) => {
                    const isEditable = !isBusy && !isFinished && !completedExerciseIds.includes(exercise.id)
                      && index === sets.findIndex(item => !item.completed);
                    const previousReps = lastSetReps.find(last => last.exerciseId === exercise.id && last.setPosition === index
                      && last.weight === Number(set.weight.replace(',', '.')))?.reps ?? 0;
                    return (
                      <View key={index} style={{ borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 12, opacity: isEditable ? 1 : 0.5 }}>
                        <Text>Set {index + 1}{set.completed ? ' — Completed' : !isEditable ? ' — Locked' : ''}{annotations[exercise.id]?.excludeAll || annotations[exercise.id]?.excludedPositions.includes(index) ? ' — Excluded from PRs and plots' : ''}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                          <View style={{ flex: 1 }}>
                            <RepSlider key={`${exercise.id}-${index}-${set.weight}`}
                              disabled={!isEditable}
                              value={set.reps} target={previousReps || exercise.prescribedRepsFirstSet}
                              label={`${exercise.name}, set ${index + 1} reps`}
                              onChange={reps => updateSet(exercise.id, index, { reps })}
                            />
                          </View>
                          <View style={{ width: 120 }}>
                            <Text>Weight (kg)</Text>
                            <WeightPicker value={set.weight} weights={exerciseWeights[exercise.id]?.weights ?? []} increments={exerciseWeights[exercise.id]?.increments ?? []}
                              onInteractionChange={setIsWeightInteracting}
                              disabled={!isEditable} label={`${exercise.name}, set ${index + 1} weight in kilograms`}
                              onChange={weight => updateSet(exercise.id, index, { weight, rememberWeight: false })}
                              onManualEntry={weight => updateSet(exercise.id, index, { weight, rememberWeight: true })} />
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
                            {set.completed && (set.isPersonalRecord || set.isSubmaximalRecord) &&
                              <Text style={{ marginTop: 4, fontSize: 11, color: set.isPersonalRecord ? '#166534' : '#64748b', textAlign: 'center' }}>
                                {set.isPersonalRecord ? 'PR' : 'Submaximal PR'}
                              </Text>}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {setDrafts[exercise.id].every(set => set.completed) && <Button title="Add set"
                    accessibilityLabel={`Add set to ${exercise.name}`} disabled={isBusy || isFinished}
                    onPress={() => setSetDrafts(current => {
                      const sets = current[exercise.id];
                      const previous = sets[sets.length - 1];
                      const last = lastSetWeights.find(item => item.exerciseId === exercise.id && item.setPosition === sets.length);
                      const weight = last ? String(last.weight) : previous.weight;
                      const reps = lastSetReps.find(item => item.exerciseId === exercise.id && item.setPosition === sets.length
                        && item.weight === Number(weight))?.reps ?? previous.reps;
                      return { ...current, [exercise.id]: [...sets, {
                        ...previous, weight, reps, completed: false, isPersonalRecord: false, isSubmaximalRecord: false,
                      }] };
                    })} />}
                </View>
              )}
            </Pressable>
            </Fragment>
          ))}
          {!isFinished && <AddWorkoutExercise existingIds={exercises.map(exercise => exercise.id)} disabled={isBusy} onAdd={addUnplannedExercise} />}
          <View style={{ marginTop: 24, marginBottom: 20 }}>
            <Button title={isFinishing ? 'Finishing…' : 'Finish workout'} onPress={finishWorkout} disabled={isBusy || isFinished} />
          </View>
        </>
      )}
    </ScrollView>
    <Modal visible={menuExercise !== null} transparent animationType="fade" onRequestClose={() => setMenuExercise(null)}>
      {menuExercise && <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 12, gap: 16 }}>
          <Text style={{ fontSize: 22 }}>{menuExercise.name}</Text>
          <Button title="View exercise history" onPress={() => { setHistoryExercise(menuExercise); setMenuExercise(null); }} />
          <Button title="Setup note" disabled={menuExercise.id < 0}
            onPress={() => { setNoteExercise(menuExercise); setMenuExercise(null); }} />
          <Button title="Add comment" onPress={() => { setOptions({ exercise: menuExercise, mode: 'comment' }); setMenuExercise(null); }} />
          <Button title="Exclude sets from tracking" onPress={() => { setOptions({ exercise: menuExercise, mode: 'tracking' }); setMenuExercise(null); }} />
          <Button title="Cancel exercise menu" onPress={() => setMenuExercise(null)} />
        </View>
      </View>}
    </Modal>
    {noteExercise && <ExerciseNoteModal key={noteExercise.id} exercise={noteExercise}
      onSaved={note => setSetupNotes(current => ({ ...current, [noteExercise.id]: note }))}
      onClose={() => setNoteExercise(null)} />}
    {historyExercise && <ExerciseHistoryModal key={historyExercise.id} exerciseId={historyExercise.id}
      name={historyExercise.name} sessionId={sessionId} onClose={() => setHistoryExercise(null)} />}
    {options && <ExerciseOptionsModal key={`${options.exercise.id}-${options.mode}`}
      name={options.exercise.name} mode={options.mode} setCount={setDrafts[options.exercise.id].length}
      initial={annotations[options.exercise.id] ?? { comment: '', excludeAll: false, excludedPositions: [] }}
      onClose={() => setOptions(null)}
      onSkip={options.mode === 'tracking' && !setDrafts[options.exercise.id].some(set => set.completed)
        ? () => { completeExercise(options.exercise.id); setOptions(null); } : undefined}
      onSave={async annotation => {
        await saveExerciseAnnotation(await initializeDatabase(), sessionId, options.exercise, annotation);
        setAnnotations(current => ({ ...current, [options.exercise.id]: annotation }));
      }} />}
    <PersonalRecordCelebration trigger={isFinished ? 0 : recordCount} />
    <Modal visible={isFinished} transparent animationType="fade" onRequestClose={closeSummary}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxHeight: '85%', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 26, color: '#166534', backgroundColor: '#dcfce7', borderRadius: 24, padding: 10 }}>✓</Text>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 24 }}>Workout finished</Text><Text style={{ fontSize: 18, color: '#475569' }}>{dayName}</Text></View>
          </View>
          <Text style={{ color: '#64748b' }}>{performedExercises.length} exercises · {completedSetCount} completed sets</Text>
          <ScrollView contentContainerStyle={{ gap: 16 }}>
            {performedExercises.length === 0 && <Text>No exercises completed.</Text>}
            {performedExercises.map(exercise => (
              <View key={exercise.id} style={{ gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{exercise.name}</Text>
                {!!annotations[exercise.id]?.comment && <Text>{annotations[exercise.id].comment}</Text>}
                <WorkoutSetTable showSetNumber rows={setDrafts[exercise.id].flatMap((set, index) => set.completed ? [{
                  id: index, setNumber: index + 1, weight: set.weight.trim() ? Number(set.weight.replace(',', '.')) : null, reps: set.reps,
                  isPR: set.isPersonalRecord, isSubmaximalPR: set.isSubmaximalRecord, excluded: annotations[exercise.id]?.excludeAll || annotations[exercise.id]?.excludedPositions.includes(index),
                }] : [])} />
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
