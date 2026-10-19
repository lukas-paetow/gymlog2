import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { Alert, Button, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  deleteExercise, deleteRoutine, initializeDatabase, insertExercise, insertRoutine,
  listExercises, listExercisesInTrainingDay, listRoutines, listTrainingDays,
  updateRoutine, getExerciseWeightOptions, getActiveRoutineId, setActiveRoutine, listReusableTrainingDays, updateExercisePrescription, reorderTrainingDayExercises,
} from '../database';
import type {
  DayExerciseDraft, Exercise, ReusableTrainingDay, Routine, TrainingDay, TrainingDayDraft, TrainingDayExercise,
} from '../database';

import type { WeightIncrement } from '../weightOptions';
import TrainingDayTable from '../components/TrainingDayTable';
import PrescriptionEditor from '../components/PrescriptionEditor';
import WeightOptionsEditor from '../components/WeightOptionsEditor';

type ViewedDay = { 
  day: TrainingDay; 
  exercises: TrainingDayExercise[] 
};


export default function RoutineScreen() {
  const viewScrollRef = useAnimatedRef<Animated.ScrollView>();
  const editorScrollRef = useAnimatedRef<Animated.ScrollView>();
  // database derived 
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  const [activeRoutineId, setActiveRoutineId] = useState<number | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [daySearch, setDaySearch] = useState('');
  const [reusableDays, setReusableDays] = useState<ReusableTrainingDay[]>([]);
  const [prescription, setPrescription] = useState<{ dayId: number; exercise: TrainingDayExercise } | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  //building routine
  const [routineName, setRoutineName] = useState('');
  const [draftDays, setDraftDays] = useState<TrainingDayDraft[]>([]);

  //building training day
  const [selectedExercises, setSelectedExercises] = useState<DayExerciseDraft[]>([]);
  const [weightInputs, setWeightInputs] = useState<Record<number, string>>({});
  const [trainingDayName, setTrainingDayName] = useState('');

  // helpers for boulding routine and days
  const [editorStep, setEditorStep] = useState<'routine' | 'day'>('routine');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<number | null>(null);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);

  //building exercise
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseWeights, setExerciseWeights] = useState<number[]>([]);
  const [weightIncrements, setWeightIncrements] = useState<WeightIncrement[]>([]);
  const [showWeightOptions, setShowWeightOptions] = useState(false);

  // viewing a saved routine
  const [viewedRoutine, setViewedRoutine] = useState<Routine | null>(null);
  const [viewedDays, setViewedDays] = useState<ViewedDay[]>([]);
  const [viewError, setViewError] = useState<string | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(false);

  // database change
  const [isSaving, setIsSaving] = useState(false);

  // Refresh library and routines on return, including deletions from the library screen.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    initializeDatabase().then(async db => {
      const library = await listExercises(db);
      const savedRoutines = await listRoutines(db);
      const activeId = await getActiveRoutineId(db);
      if (!cancelled) {
        setExercises(library);
        setRoutines(savedRoutines);
        setActiveRoutineId(activeId);
        setDatabase(db);
      }
    }).catch(error => {
      console.error('Database initialization failed:', error);
      if (!cancelled) Alert.alert('Database error', 'Could not open the database.');
    });
    return () => { cancelled = true; };  // if effect callback returns a function, react treats it as cleanup.
                                         // so this is done after unmounting so that no db stuff happens
  }, []));

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
    setDayPickerOpen(false);
    setDraftDays([]);
    setEditorStep('routine');
    setIsEditorOpen(true);
  }

  function newTrainingDayMenu() {
    setWeightInputs({});
    setEditingDayIndex(null);
    setTrainingDayName('');
    setSelectedExercises([]);
    setExerciseName('');
    setExerciseWeights([]);
    setWeightIncrements([]);
    setShowWeightOptions(false);
    setEditorStep('day');
  }

  function editViewedRoutine() {
    if (!viewedRoutine || isLoadingView || viewError || isSaving) return;
    setDayPickerOpen(false);
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
    setWeightInputs({});
    const day = draftDays[index];
    setEditingDayIndex(index);
    setTrainingDayName(day.name);
    setSelectedExercises(day.exercises.map(entry => ({ ...entry })));
    setExerciseName('');
    setExerciseWeights([]);
    setWeightIncrements([]);
    setShowWeightOptions(false);
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
      await insertExercise(database, name, exerciseWeights, weightIncrements);
      setExercises(await listExercises(database));
      setExerciseName('');
      setExerciseWeights([]);
      setWeightIncrements([]);
      setShowWeightOptions(false);
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
      setActiveRoutineId(await getActiveRoutineId(database));
      setIsEditorOpen(false);
      setEditingRoutineId(null);
    } catch (error) {
      console.error('Deleting routine failed:', error);
      Alert.alert('Delete failed', 'Could not delete the routine.');
    } finally { setIsSaving(false); }
  }

  function viewRoutine(routine: Routine) {
    setPrescription(null);
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

  async function activateRoutine(routine: Routine) {
    if (!database || isSaving) return;
    setIsSaving(true);
    try { await setActiveRoutine(database, routine.id); setActiveRoutineId(routine.id); }
    catch { Alert.alert('Save failed', 'Could not change the active routine.'); }
    finally { setIsSaving(false); }
  }

  async function copyRoutine(routine: Routine) {
    if (!database || isSaving) return;
    setIsSaving(true);
    try {
      const days = await listTrainingDays(database, routine.id);
      const copies = await Promise.all(days.map(async day => ({ name: day.name,
        exercises: (await listExercisesInTrainingDay(database, day.id)).map(({ name, ...entry }) => entry),
      })));
      setEditingRoutineId(null);
      setEditingDayIndex(null);
      setRoutineName(`${routine.name} (copy)`);
      setDraftDays(copies);
      setEditorStep('routine');
      setDayPickerOpen(false);
      setViewedRoutine(null);
      setIsEditorOpen(true);
    } catch { Alert.alert('Copy failed', 'Could not load the routine.'); }
    finally { setIsSaving(false); }
  }

  async function openDayPicker() {
    if (!database || isSaving) return;
    setIsSaving(true);
    try {
      setReusableDays(await listReusableTrainingDays(database));
      setDaySearch('');
      setDayPickerOpen(true);
    } catch { Alert.alert('Load failed', 'Could not load saved training days.'); }
    finally { setIsSaving(false); }
  }

  async function loadTrainingDay(day: ReusableTrainingDay) {
    if (!database || isSaving) return;
    setIsSaving(true);
    try {
      const entries = await listExercisesInTrainingDay(database, day.id);
      newTrainingDayMenu();
      setTrainingDayName(day.name);
      setSelectedExercises(entries.map(({ name, ...entry }) => entry));
      setDayPickerOpen(false);
    } catch { Alert.alert('Load failed', 'Could not load the training day.'); }
    finally { setIsSaving(false); }
  }

  async function savePrescription(updated: TrainingDayExercise) {
    if (!database || !prescription) return;
    setIsSaving(true);
    try {
      await updateExercisePrescription(database, prescription.dayId, updated);
      setViewedDays(current => current.map(content => content.day.id === prescription.dayId
        ? { ...content, exercises: content.exercises.map(entry => entry.id === updated.id ? updated : entry) } : content));
      setPrescription(null);
    } finally { setIsSaving(false); }
  }

  async function reorderViewedDay(dayId: number, entries: TrainingDayExercise[]) {
    if (!database || isSaving) return;
    const previous = viewedDays;
    setIsSaving(true);
    setViewedDays(current => current.map(content => content.day.id === dayId ? { ...content, exercises: entries } : content));
    try { await reorderTrainingDayExercises(database, dayId, entries.map(entry => entry.id)); }
    catch {
      setViewedDays(previous);
      Alert.alert('Save failed', 'Could not save the exercise order. Reopen the routine if its exercises changed.');
    } finally { setIsSaving(false); }
  }

  const busy = database === null || isSaving;
  const active = routines.find(routine => routine.id === activeRoutineId);
  const orderedRoutines = active ? [active, ...routines.filter(routine => routine.id !== activeRoutineId)] : routines;
  const matchingDays = reusableDays.filter(day => day.name.toLocaleLowerCase().includes(daySearch.trim().toLocaleLowerCase()));




  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Routines</Text>
      <ScrollView>
        {/* && means: if true, show text on the right*/}
        {routines.length === 0 && <Text>No routines yet.</Text>} 
        {/* overview of routines*/}
        {!active && routines.length > 0 && <Text>No active routine selected.</Text>}
        {orderedRoutines.map((routine, index) => (
          <Fragment key={routine.id}>
            {active && index === 1 && <View style={{ borderTopWidth: 1, borderColor: '#64748b', marginTop: 16, paddingTop: 12 }}><Text>Inactive routines</Text></View>}
            <View style={{ paddingVertical: 10, gap: 8 }}>
              <Text style={{ fontSize: 18 }}>{routine.name}</Text>
              {routine.id === activeRoutineId && <Text style={{ color: '#166534' }}>Active routine</Text>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button title="View" accessibilityLabel={`View ${routine.name}`} onPress={() => viewRoutine(routine)} disabled={busy} />
                {routine.id !== activeRoutineId && <Button title="Make active" accessibilityLabel={`Activate ${routine.name}`} onPress={() => activateRoutine(routine)} disabled={busy} />}

              </View>
            </View>
          </Fragment>
        ))}
      </ScrollView>

      <Button title="Add routine" onPress={newRoutineMenu} disabled={busy} />
      <Modal visible={isEditorOpen} onRequestClose={closeEditor}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.ScrollView ref={editorScrollRef} style={{ flex: 1 }} contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled"
          onFocus={event => {
            const target = event.nativeEvent.target;
            setTimeout(() => editorScrollRef.current?.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(target, 24, true), 250);
          }}>
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
              <Button title="Add training day" onPress={() => { setDayPickerOpen(false); newTrainingDayMenu(); }} disabled={busy} />
              <Button title="Load existing training day" onPress={openDayPicker} disabled={busy} />
              {dayPickerOpen && <View style={{ gap: 8 }}>
                <TextInput accessibilityLabel="Search training days" placeholder="Search training days by name" value={daySearch} onChangeText={setDaySearch} editable={!busy} style={styles.input} />
                {matchingDays.length === 0 && <Text>No matching training days.</Text>}
                {matchingDays.map(day => <Button key={day.id} title={`${day.name} · ${day.routineName}`} accessibilityLabel={`Load ${day.name} from ${day.routineName}`} onPress={() => loadTrainingDay(day)} disabled={busy} />)}
                <Button title="Close day search" onPress={() => setDayPickerOpen(false)} disabled={busy} />
              </View>}
              <Button title={isSaving ? 'Saving…' : 'Save routine'} onPress={saveRoutine} disabled={busy} />
              {editingRoutineId !== null && <Button title="Delete routine" color="#b91c1c"
                accessibilityLabel={`Delete ${routines.find(routine => routine.id === editingRoutineId)?.name ?? routineName}`}
                disabled={busy} onPress={() => {
                  const routine = routines.find(entry => entry.id === editingRoutineId);
                  if (!routine) return;
                  Alert.alert('Delete routine?', `Delete "${routine.name}" and all its training days?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => removeRoutine(routine.id) },
                  ]);
                }} />}

            </>
          ) : (
            <>
              <Text style={styles.heading}>{editingDayIndex === null ? 'New training day' : 'Edit training day'}</Text>
              <TextInput style={styles.input} placeholder="Training day name" value={trainingDayName}
                onChangeText={setTrainingDayName} editable={!isSaving} />
              <TextInput style={styles.input} placeholder="New exercise name" value={exerciseName}
                onChangeText={setExerciseName} editable={!isSaving} />
              <Button title="Configure available weights" onPress={() => setShowWeightOptions(current => !current)} disabled={busy} />
              {showWeightOptions && <WeightOptionsEditor increments={weightIncrements} onIncrementsChange={setWeightIncrements} weights={exerciseWeights} onChange={setExerciseWeights}
                exercises={exercises} disabled={busy}
                onCopy={async id => getExerciseWeightOptions(await initializeDatabase(), id)} />}
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
              <Text>Hold the handle to reorder exercises.</Text>
              <Sortable.Grid data={selectedExercises} columns={1} scrollableRef={editorScrollRef} customHandle
                dragActivationDelay={400} sortEnabled={!busy} activeItemScale={1.01}
                keyExtractor={entry => String(entry.id)} onDragEnd={({ data }) => setSelectedExercises(data)}
                renderItem={({ item: entry }) => (
                <View key={entry.id} style={{ backgroundColor: '#fff', padding: 12, gap: 8 }}>
                  <Sortable.Handle><View accessibilityLabel="Hold to reorder exercise" style={{ padding: 12, backgroundColor: '#e2e8f0' }}>
                    <Text>☰ {exercises.find(exercise => exercise.id === entry.id)?.name}</Text>
                  </View></Sortable.Handle>
                  <Button title="Remove from day" disabled={busy}
                    onPress={() => {
                      setSelectedExercises(current => current.filter(item => item.id !== entry.id));
                      setWeightInputs(current => { const next = { ...current }; delete next[entry.id]; return next; });
                    }} />
                  <Text>Prescribed sets</Text>
                  <TextInput style={styles.input} keyboardType="number-pad" value={String(entry.prescribedSets)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.id === entry.id ? { ...item, prescribedSets: Number(text) } : item))} />
                  <Text>First-set reps</Text>
                  <TextInput style={styles.input} keyboardType="number-pad" value={String(entry.prescribedRepsFirstSet)}
                    editable={!isSaving} onChangeText={text => setSelectedExercises(current => current.map(item =>
                      item.id === entry.id ? { ...item, prescribedRepsFirstSet: Number(text) } : item))} />
                  <Text>First-set weight (kg)</Text>
                  <TextInput style={styles.input} keyboardType="default" value={weightInputs[entry.id] ?? String(entry.prescribedWeightFirstSet)}
                    editable={!isSaving} onChangeText={text => {
                      setWeightInputs(current => ({ ...current, [entry.id]: text }));
                      setSelectedExercises(current => current.map(item => item.id === entry.id
                        ? { ...item, prescribedWeightFirstSet: text.trim() ? Number(text.replace(',', '.')) : NaN } : item));
                    }} />
                </View>
              )} />
              <Button title={editingDayIndex === null ? 'Add day to routine draft' : 'Save day to routine draft'} onPress={addTrainingDay} disabled={busy} />
            </>
          )}
          <Button title={editorStep === 'day' ? 'Cancel day' : editingRoutineId === null ? 'Cancel routine' : 'Cancel changes'} onPress={closeEditor} disabled={isSaving} />
        </Animated.ScrollView>
        </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>
      <Modal visible={viewedRoutine !== null} onRequestClose={() => { if (!isSaving) { if (prescription) setPrescription(null); else setViewedRoutine(null); } }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.ScrollView ref={viewScrollRef} style={{ flex: 1 }} contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled"
          onFocus={event => {
            const target = event.nativeEvent.target;
            setTimeout(() => viewScrollRef.current?.getScrollResponder()?.scrollResponderScrollNativeHandleToKeyboard(target, 24, true), 250);
          }}>
          <Text style={styles.heading}>{viewedRoutine?.name}</Text>
          {isLoadingView && <Text>Loading training days…</Text>}
          {viewError && <Text>{viewError}</Text>}
          {prescription ? <PrescriptionEditor key={`${prescription.dayId}-${prescription.exercise.id}`} exercise={prescription.exercise}
            onSave={savePrescription} onCancel={() => setPrescription(null)} /> : <>
            {!isLoadingView && !viewError && <Text>First-set prescription. Tap to edit; hold and drag to reorder.</Text>}
            {!isLoadingView && !viewError && viewedDays.map(({ day, exercises: entries }) => (
              <TrainingDayTable key={day.id} name={day.name} exercises={entries} disabled={busy} scrollableRef={viewScrollRef}
                onReorder={exercises => { void reorderViewedDay(day.id, exercises); }}
                onEdit={exercise => setPrescription({ dayId: day.id, exercise })} />
            ))}
            <Button title="Edit routine" onPress={editViewedRoutine} disabled={busy || isLoadingView || viewError !== null} />
            <Button title="Copy routine" onPress={() => { if (viewedRoutine) void copyRoutine(viewedRoutine); }} disabled={busy || isLoadingView || viewError !== null} />
          </>}
          <Button title="Close" disabled={isSaving} onPress={() => { setPrescription(null); setViewedRoutine(null); }} />
        </Animated.ScrollView>
        </KeyboardAvoidingView>
        </GestureHandlerRootView>
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
