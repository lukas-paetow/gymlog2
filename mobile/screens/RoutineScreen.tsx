import { Alert, Button, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  deleteExercise, deleteRoutine, initializeDatabase, insertExercise, insertRoutine,
  listExercises, listExercisesInTrainingDay, listRoutines, listTrainingDays,
} from '../database';
import type {
  DayExerciseDraft, Exercise, Routine, TrainingDay, TrainingDayDraft, TrainingDayExercise,
} from '../database';

type ViewedDay = { day: TrainingDay; exercises: TrainingDayExercise[] };

export default function RoutineScreen() {
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineName, setRoutineName] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseName, setExerciseName] = useState('');
  const [trainingDayName, setTrainingDayName] = useState('');
  const [draftDays, setDraftDays] = useState<TrainingDayDraft[]>([]);

  const [viewedRoutine, setViewedRoutine] = useState<Routine | null>(null);
  const [viewedDays, setViewedDays] = useState<ViewedDay[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<DayExerciseDraft[]>([]);

  const [editorStep, setEditorStep] = useState<'routine' | 'day'>('routine');
  const [viewError, setViewError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingView, setIsLoadingView] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initializeDatabase().then(async db => {
      const library = await listExercises(db);
      const savedRoutines = await listRoutines(db);
      if (!cancelled) {
        setExercises(library);
        setRoutines(savedRoutines);
        setDatabase(db);
      }
    }).catch(error => {
      console.error('Database initialization failed:', error);
      if (!cancelled) Alert.alert('Database error', 'Could not open the database.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!database || !viewedRoutine) return;
    let cancelled = false;
    listTrainingDays(database, viewedRoutine.id).then(async days => {
      const contents = await Promise.all(days.map(async day => ({
        day, exercises: await listExercisesInTrainingDay(database, day.id),
      })));
      if (!cancelled) setViewedDays(contents);
    }).catch(error => {
      console.error('Loading routine failed:', error);
      if (!cancelled) setViewError('Could not load this routine.');
    }).finally(() => {
      if (!cancelled) setIsLoadingView(false);
    });
    return () => { cancelled = true; };
  }, [database, viewedRoutine]);

  function newRoutineMenu() {
    setRoutineName('');
    setDraftDays([]);
    setEditorStep('routine');
    setIsEditorOpen(true);
  }

  function newTrainingDayMenu() {
    setTrainingDayName('');
    setSelectedExercises([]);
    setExerciseName('');
    setEditorStep('day');
  }

  function addExerciseToTrainingDay(exerciseId: number) {
    setSelectedExercises(current => current.some(entry => entry.exerciseId === exerciseId)
      ? current : [...current, { exerciseId, prescribedSets: 2, prescribedWeightFirstSet: 0 }]);
  }

  function addTrainingDay() {
    const name = trainingDayName.trim();
    if (!name || selectedExercises.length === 0) {
      Alert.alert('Training day incomplete', 'Enter a name and select at least one exercise.');
      return;
    }
    if (selectedExercises.some(entry => !Number.isInteger(entry.prescribedSets)
      || entry.prescribedSets < 1 || !Number.isFinite(entry.prescribedWeightFirstSet))) 
      {
      Alert.alert('Invalid prescription', 'Sets must be positive integers and weight must be nonnegative.');
      return;
    }
    // This changes the draft only. Save routine writes all days to SQLite.
    setDraftDays(current => [...current, { name, exercises: selectedExercises }]);
    setEditorStep('routine');
  }

  async function saveRoutine() {
    if (!database || isSaving) return;
    const name = routineName.trim();
    if (!name || draftDays.length === 0) {
      Alert.alert('Routine incomplete', 'Enter a name and add at least one training day.');
      return;
    }
    setIsSaving(true);
    try {
      await insertRoutine(database, name, draftDays);
      setRoutines(await listRoutines(database));
      setIsEditorOpen(false);
    } catch (error) {
      console.error('Saving routine failed:', error);
      Alert.alert('Save failed', 'Could not save the routine.');
    } finally { setIsSaving(false); }
  }

  async function addExercise() {
    if (!database || isSaving) return;
    const name = exerciseName.trim();
    if (!name) { Alert.alert('Please enter an exercise name'); return; }
    if (exercises.some(exercise => exercise.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('This exercise already exists'); return;
    }
    setIsSaving(true);
    try {
      await insertExercise(database, name);
      setExercises(await listExercises(database));
      setExerciseName('');
    } catch (error) {
      console.error('Adding exercise failed:', error);
      Alert.alert('Save failed', 'Could not save the exercise.');
    } finally { setIsSaving(false); }
  }

  async function removeExercise(exerciseId: number) {
    if (!database || isSaving) return;
    setIsSaving(true);
    try {
      await deleteExercise(database, exerciseId);
      setExercises(await listExercises(database));
      setSelectedExercises(current => current.filter(entry => entry.exerciseId !== exerciseId));
      setDraftDays(current => current.map(day => ({ ...day,
        exercises: day.exercises.filter(entry => entry.exerciseId !== exerciseId),
      })));
    } catch (error) {
      console.error('Deleting exercise failed:', error);
      Alert.alert('Delete failed', 'Could not delete the exercise.');
    } finally { setIsSaving(false); }
  }

  function confirmDeleteExercise(exercise: Exercise) {
    Alert.alert('Delete exercise?',
      `Delete "${exercise.name}" from the library and all training days that use it?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeExercise(exercise.id) },
      ]);
  }

  async function removeRoutine(id: number) {
    if (!database || isSaving) return;
    setIsSaving(true);
    try {
      await deleteRoutine(database, id);
      setRoutines(await listRoutines(database));
    } catch (error) {
      console.error('Deleting routine failed:', error);
      Alert.alert('Delete failed', 'Could not delete the routine.');
    } finally { setIsSaving(false); }
  }

  function viewRoutine(routine: Routine) {
    setViewedDays([]);
    setViewError(null);
    setIsLoadingView(true);
    setViewedRoutine(routine);
  }

  function closeEditor() {
    if (isSaving) return;
    if (editorStep === 'day') setEditorStep('routine');
    else setIsEditorOpen(false);
  }

  const busy = database === null || isSaving;
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Routines</Text>
      <ScrollView>
        {routines.length === 0 && <Text>No routines yet.</Text>}
        {routines.map(routine => (
          <View key={routine.id} style={styles.row}>
            <Button title="View" onPress={() => viewRoutine(routine)} disabled={busy} />
            <Text>{routine.name}</Text>
            <Button title="X" accessibilityLabel={`Delete ${routine.name}`} disabled={busy}
              onPress={() => Alert.alert('Delete routine?', `Delete "${routine.name}" and all its training days?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => removeRoutine(routine.id) },
              ])} />
          </View>
        ))}
      </ScrollView>
      <Button title="Add routine" onPress={newRoutineMenu} disabled={busy} />
      <Modal visible={isEditorOpen} onRequestClose={closeEditor}>
        <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">
          {editorStep === 'routine' ? (
            <>
              <Text style={styles.heading}>New routine</Text>
              <TextInput style={styles.input} placeholder="Routine name" value={routineName}
                onChangeText={setRoutineName} editable={!isSaving} />
              {draftDays.map((day, index) => (
                <Text key={index}>{index + 1}. {day.name} ({day.exercises.length} exercises)</Text>
              ))}
              <Button title="Add training day" onPress={newTrainingDayMenu} disabled={busy} />
              <Button title={isSaving ? 'Saving…' : 'Save routine'} onPress={saveRoutine} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={styles.heading}>New training day</Text>
              <TextInput style={styles.input} placeholder="Training day name" value={trainingDayName}
                onChangeText={setTrainingDayName} editable={!isSaving} />
              <TextInput style={styles.input} placeholder="New exercise name" value={exerciseName}
                onChangeText={setExerciseName} editable={!isSaving} />
              <Button title="Add exercise to library" onPress={addExercise} disabled={busy} />
              {exercises.map(exercise => (
                <View key={exercise.id} style={styles.row}>
                  <Button title={exercise.name} onPress={() => addExerciseToTrainingDay(exercise.id)} disabled={busy} />
                  <Button title="X" accessibilityLabel={`Delete ${exercise.name} from library`}
                    onPress={() => confirmDeleteExercise(exercise)} disabled={busy} />
                </View>
              ))}
              <Text style={styles.heading}>Selected exercises</Text>
              {selectedExercises.map(entry => (
                <View key={entry.exerciseId}>
                  <Text>{exercises.find(exercise => exercise.id === entry.exerciseId)?.name}</Text>
                  <Text>Prescribed sets</Text>
                  <TextInput style={styles.input} keyboardType="number-pad" value={String(entry.prescribedSets)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.exerciseId === entry.exerciseId ? { ...item, prescribedSets: Number(text) } : item))} />
                  <Text>First-set weight (kg)</Text>
                  <TextInput style={styles.input} keyboardType="decimal-pad" value={String(entry.prescribedWeightFirstSet)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.exerciseId === entry.exerciseId ? { ...item, prescribedWeightFirstSet: Number(text.replace(',', '.')) } : item))} />
                </View>
              ))}
              <Button title="Add day to routine draft" onPress={addTrainingDay} disabled={busy} />
            </>
          )}
          <Button title={editorStep === 'day' ? 'Cancel day' : 'Cancel routine'} onPress={closeEditor} disabled={isSaving} />
        </ScrollView>
      </Modal>
      <Modal visible={viewedRoutine !== null} onRequestClose={() => setViewedRoutine(null)}>
        <ScrollView contentContainerStyle={styles.editor}>
          <Text style={styles.heading}>{viewedRoutine?.name}</Text>
          {isLoadingView && <Text>Loading training days…</Text>}
          {viewError && <Text>{viewError}</Text>}
          {!isLoadingView && !viewError && viewedDays.map(({ day, exercises: entries }) => (
            <View key={day.id}>
              <Text style={styles.heading}>{day.name}</Text>
              {entries.map(entry => (
                <Text key={entry.id}>{entry.name} — {entry.prescribed_sets} sets, {entry.prescribed_weight_firstset} kg</Text>
              ))}
            </View>
          ))}
          <Button title="Close" onPress={() => setViewedRoutine(null)} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#ababab' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginVertical: 6 },
  heading: { fontSize: 20, marginVertical: 12 },
  editor: { padding: 24, paddingTop: 48, gap: 12 },
  input: { borderWidth: 1, borderColor: '#888', borderRadius: 6, padding: 12 },
});
