import { Alert, Button, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useState } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  deleteExercise, deleteRoutine, initializeDatabase, insertExercise, insertRoutine,
  listExercises, listExercisesInTrainingDay, listRoutines, listTrainingDays,
  updateRoutine,
} from '../database';
import type {
  DayExerciseDraft, Exercise, Routine, TrainingDay, TrainingDayDraft, TrainingDayExercise,
} from '../database';

type ViewedDay = { 
  day: TrainingDay; 
  exercises: TrainingDayExercise[] 
};


export default function RoutineScreen() {
  // database derived 
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  //building routine
  const [routineName, setRoutineName] = useState('');
  const [draftDays, setDraftDays] = useState<TrainingDayDraft[]>([]);

  //building training day
  const [selectedExercises, setSelectedExercises] = useState<DayExerciseDraft[]>([]);
  const [trainingDayName, setTrainingDayName] = useState('');

  // helpers for boulding routine and days
  const [editorStep, setEditorStep] = useState<'routine' | 'day'>('routine');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<number | null>(null);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);

  //building exercise
  const [exerciseName, setExerciseName] = useState('');

  // viewing a saved routine
  const [viewedRoutine, setViewedRoutine] = useState<Routine | null>(null);
  const [viewedDays, setViewedDays] = useState<ViewedDay[]>([]);
  const [viewError, setViewError] = useState<string | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(false);

  // database change
  const [isSaving, setIsSaving] = useState(false);

  // runs after component is mounted ([] empty dependency)
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
    return () => { cancelled = true; };  // if effect callback returns a function, react treats it as cleanup.
                                         // so this is done after unmounting so that no db stuff happens
  }, []);

  // loading routine to view in detail
  // runs when database or viewedRoutine mounts or changes
  useEffect(() => {
    if (!database || !viewedRoutine) return;
    let cancelled = false;
    
    // listTrainingDays returns promise for array of TrainingDays
    // if a function has await, it needs to be async
    listTrainingDays(database, viewedRoutine.id).then(async days => { // then passes result to "days". typescript infers type
      // ({ }) means we want something returned, not just a body { }
      const contents = await Promise.all(days.map(async day => ({ // promise preserves order and resolves the promises that are returned
        day, exercises: await listExercisesInTrainingDay(database, day.id), // an object with day and exercise is populated
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
    setEditingRoutineId(null);
    setEditingDayIndex(null);
    setRoutineName('');
    setDraftDays([]);
    setEditorStep('routine');
    setIsEditorOpen(true);
  }

  function newTrainingDayMenu() {
    setEditingDayIndex(null);
    setTrainingDayName('');
    setSelectedExercises([]);
    setExerciseName('');
    setEditorStep('day');
  }

  function editViewedRoutine() {
    if (!viewedRoutine || isLoadingView || viewError || isSaving) return;
    setEditingRoutineId(viewedRoutine.id);
    setRoutineName(viewedRoutine.name);
    setDraftDays(viewedDays.map(({ day, exercises: entries }) => ({
      id: day.id, name: day.name,
      exercises: entries.map(entry => ({
        id: entry.id, prescribedSets: entry.prescribedSets,
        prescribedRepsFirstSet: entry.prescribedRepsFirstSet,
        prescribedWeightFirstSet: entry.prescribedWeightFirstSet,
      })),
    })));
    setEditingDayIndex(null);
    setEditorStep('routine');
    setViewedRoutine(null);
    setIsEditorOpen(true);
  }

  function editDraftDay(index: number) {
    const day = draftDays[index];
    setEditingDayIndex(index);
    setTrainingDayName(day.name);
    setSelectedExercises(day.exercises.map(entry => ({ ...entry })));
    setExerciseName('');
    setEditorStep('day');
  }

  function addExerciseToTrainingDay(exerciseId: number) {
    setSelectedExercises(current => current.some(entry => entry.id === exerciseId)
      ? current : [...current, { id: exerciseId, prescribedSets: 2, prescribedWeightFirstSet: 0, prescribedRepsFirstSet: 8 }]); // no further initialization of TrainingDayExercise
  }

  function addTrainingDay() {
    const name = trainingDayName.trim();
    if (!name || selectedExercises.length === 0) {
      Alert.alert('Training day incomplete', 'Enter a name and select at least one exercise.');
      return;
    }
    if (selectedExercises.some(entry => !Number.isInteger(entry.prescribedSets)
      || entry.prescribedSets < 1 || !Number.isFinite(entry.prescribedWeightFirstSet)
      || !Number.isInteger(entry.prescribedRepsFirstSet) || entry.prescribedRepsFirstSet < 1)) 
      {
      Alert.alert('Invalid prescription', 'Sets and first-set reps must be positive integers and weight must be finite.');
      return;
    }
    // This changes the draft only. Save routine writes all days to SQLite.
    setDraftDays(current => editingDayIndex === null
      ? [...current, { name, exercises: selectedExercises }]
      : current.map((day, index) => index === editingDayIndex
        ? { ...day, name, exercises: selectedExercises } : day));
    setEditingDayIndex(null);
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
      if (editingRoutineId === null) await insertRoutine(database, name, draftDays);
      else await updateRoutine(database, editingRoutineId, name, draftDays);
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
      setSelectedExercises(current => current.filter(entry => entry.id !== exerciseId));
      setDraftDays(current => current.map(day => ({ ...day,
        exercises: day.exercises.filter(entry => entry.id !== exerciseId),
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
        {/* && means: if true, show text on the right*/}
        {routines.length === 0 && <Text>No routines yet.</Text>} 
        {/* overview of routines*/}
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
              <Text style={styles.heading}>{editingRoutineId === null ? 'New routine' : 'Edit routine'}</Text>
              <TextInput style={styles.input} placeholder="Routine name" value={routineName}
                onChangeText={setRoutineName} editable={!isSaving} />
              {draftDays.map((day, index) => (
                <View key={day.id ?? `new-${index}`}>
                  <Text>{index + 1}. {day.name} ({day.exercises.length} exercises)</Text>
                  <View style={styles.row}>
                    <Button title="Edit day" onPress={() => editDraftDay(index)} disabled={busy} />
                    <Button title="Remove day" onPress={() => setDraftDays(current => current.filter((_, position) => position !== index))} disabled={busy} />
                  </View>
                </View>
              ))}
              <Button title="Add training day" onPress={newTrainingDayMenu} disabled={busy} />
              <Button title={isSaving ? 'Saving…' : 'Save routine'} onPress={saveRoutine} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={styles.heading}>{editingDayIndex === null ? 'New training day' : 'Edit training day'}</Text>
              <TextInput style={styles.input} placeholder="Training day name" value={trainingDayName}
                onChangeText={setTrainingDayName} editable={!isSaving} />
              <TextInput style={styles.input} placeholder="New exercise name" value={exerciseName}
                onChangeText={setExerciseName} editable={!isSaving} />
              {/*addExercise() in onPress would call while rendering, like passing a return value*/}
              <Button title="Add exercise to library" onPress={addExercise} disabled={busy}/>
              {exercises.map(exercise => (
                <View key={exercise.id} style={styles.row}>
                  <Button title={exercise.name} onPress={() => addExerciseToTrainingDay(exercise.id)} disabled={busy} />
                  <Button title="X" accessibilityLabel={`Delete ${exercise.name} from library`}
                    onPress={() => confirmDeleteExercise(exercise)} disabled={busy} />
                </View>
              ))}

              <Text style={styles.heading}>Selected exercises</Text>
              {selectedExercises.map(entry => (
                <View key={entry.id}>
                  <Text>{exercises.find(exercise => exercise.id === entry.id)?.name}</Text>
                  <Button title="Remove from day" disabled={busy}
                    onPress={() => setSelectedExercises(current => current.filter(item => item.id !== entry.id))} />
                  <Text>Prescribed sets</Text>
                  <TextInput style={styles.input} keyboardType="number-pad" value={String(entry.prescribedSets)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.id === entry.id ? { ...item, prescribedSets: Number(text) } : item))} />
                  <Text>First-set reps</Text>
                  <TextInput style={styles.input} keyboardType="number-pad" value={String(entry.prescribedRepsFirstSet)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.id === entry.id ? { ...item, prescribedRepsFirstSet: Number(text) } : item))} />
                  <Text>First-set weight (kg)</Text>
                  <TextInput style={styles.input} keyboardType="decimal-pad" value={String(entry.prescribedWeightFirstSet)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.id === entry.id ? { ...item, prescribedWeightFirstSet: Number(text.replace(',', '.')) } : item))} />
                </View>
              ))}
              <Button title={editingDayIndex === null ? 'Add day to routine draft' : 'Save day to routine draft'} onPress={addTrainingDay} disabled={busy} />
            </>
          )}
          <Button title={editorStep === 'day' ? 'Cancel day' : editingRoutineId === null ? 'Cancel routine' : 'Cancel changes'} onPress={closeEditor} disabled={isSaving} />
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
                <Text key={entry.id}>{entry.name} — {entry.prescribedSets} sets; first set: {entry.prescribedRepsFirstSet} reps at {entry.prescribedWeightFirstSet} kg</Text>
              ))}
            </View>
          ))}
          <Button title="Edit routine" onPress={editViewedRoutine} disabled={busy || isLoadingView || viewError !== null} />
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
