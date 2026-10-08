import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, Button, View, Alert, Modal, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';

import { initializeDatabase, insertExercise, insertWorkoutTemplate, listExercises, 
         listWorkoutTemplates, listExercisesInRoutine, deleteWorkoutTemplate, deleteExercise } from '../database';
import type { Exercise } from '../database';
import type { RoutineExercise } from '../database';
import type { WorkoutTemplate } from '../database';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;

export default function RoutineScreen() {

// TODO
	// need to refresh routine screen when i close the modal after adding new routine?
	// yeah ok i will need to write a dedicated function and not be lazy with the button next

  // for adding new objects
  const [exerciseName, setExerciseName] = useState('');
  const [templateName, setTemplateName] = useState('');

  // for adding exercises to new workout
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<number[]>([]);

  // for having a list of exercises to put into db
  const [exercises, setExercises] = useState<Exercise[]>([]);

  const [routines, setRoutines] = useState<WorkoutTemplate[]>([]);

  // this state is just about the connection to the db
  // a database connection OR none yet
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);


  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewedRoutine, setViewedRoutine] = useState<WorkoutTemplate | null>(null);
  const [viewedExercises, setViewedExercises] = useState<RoutineExercise[]>([]);
  const [isViewingLoading, setIsViewingLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);

  function viewRoutine(routine: WorkoutTemplate) {
    if (database === null || isSaving) return;
    setViewedExercises([]);
    setViewError(null);
    setIsViewingLoading(true);
    setViewedRoutine(routine);
  }

  function closeRoutineView() {
    setViewedRoutine(null);
  }

  useEffect(() => {
    if (database === null || viewedRoutine === null) return;
    let cancelled = false;

    listExercisesInRoutine(database, viewedRoutine.id)
      .then((rows) => {
        if (!cancelled) setViewedExercises(rows);
      })
      .catch((error) => {
        console.error('Loading routine exercises failed:', error);
        if (!cancelled) setViewError('Could not load this routine. Close and try again.');
      })
      .finally(() => {
        if (!cancelled) setIsViewingLoading(false);
      });

    // Ignore results if the modal closes or a different routine is opened.
    return () => { cancelled = true; };
  }, [database, viewedRoutine]);

  // open modal and create new routine
  function newTemplateMenu() {
	setExerciseName('');
	setTemplateName('');
	setSelectedExerciseIds([]);
	setIsModalOpen(true);
  }

  function confirmDeleteExercise(exercise: Exercise) {
    // TODO: Warn that deleting this exercise changes routines that use it.
    // Delete only after confirmation, then refresh the library and draft.
    Alert.alert(
    'Delete exercise?',
    `Deleting "${exercise.name}" this deletes it from all routines including it, modifying them.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeExercise(exercise.id),
      },
    ]
  );
  }

  // keeps track using setSelectedExerciseIds. need to process that
  function addExerciseToWorkout(exerciseId: number) {
	if (database === null || isSaving) {
		return;
	}
	setSelectedExerciseIds((current) =>
	  current.includes(exerciseId)
	    ? current
	    : [...current, exerciseId]
        );
	console.log('Adding exercise', exerciseId);
  }

  // close "Add Routine" Modal, save routine, reset quantities
  async function addRoutine(){
	if (database === null || isSaving) {
		return;
	}
	const name = templateName.trim();
	if (!name) {
	  Alert.alert('Please enter a name for the Routine');
	  return;
	}
	setIsSaving(true);
	try {
		await insertWorkoutTemplate(database,name,selectedExerciseIds);
		const templates = await listWorkoutTemplates(database); // without await, this is just a promise that has no .map
		setRoutines(templates);
		setSelectedExerciseIds([]);
		setTemplateName('');
		setIsModalOpen(false);
	}
	catch (error) {
		console.error('Saving new routine failed:', error);
		Alert.alert('Saving Routine failed');
	}
	finally {
		setIsSaving(false);
	}
  }

  async function removeExercise(exerciseId: number) {
    if (database === null || isSaving) {
      return;
    }
    if (!exerciseId) {
      Alert.alert('The exercise you are trying to delete has no ID');
      return;
      }
    setIsSaving(true);
    try {
      await deleteExercise(database, exerciseId);
      const exercisesNow = await listExercises(database);
      setExercises(exercisesNow);
      // do i also need to reset routines here?
    }
    catch (error) {
      console.error('Deleting exercise failed:', error);
      Alert.alert('Deleting exercise failed');
    }
    finally {
      setIsSaving(false);
    }
  }

  async function removeRoutine(templateId: number) {
    if (database === null || isSaving) {
      return;
    }
    if (!templateId) {
      Alert.alert('The Routine you are trying to delete has no ID');
      return;
    }
    setIsSaving(true);
    try {
      await deleteWorkoutTemplate(database, templateId);
      // update routines 
      const templates = await listWorkoutTemplates(database);
      setRoutines(templates);
    }
    catch (error) {
      console.error('Deleting routine failed:', error);
      Alert.alert('Deleting Routine failed');
    }
    finally {
      setIsSaving(false);
    }
  }


  function confirmDeleteRoutine(routine: WorkoutTemplate) {
    Alert.alert(
    'Delete routine?',
    `Delete "${routine.name}"?`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => removeRoutine(routine.id),
      },
    ]
  );
  }

  // Exercises is populated, ExerciseName is reset
  async function addExercise() {
	if (database === null || isSaving) {
		return;
	}
	const name = exerciseName.trim();
	if (name.length==0) {
		Alert.alert('Please enter an exercise name');
		return;
	}

	const alreadyExists = exercises.some(
		//no {} around the following: result is immediately returned
		// === is check without type conversion
		// (exercise) is one entry from array
		(exercise) => exercise.name.toLowerCase() === name.toLowerCase()
	);
	if (alreadyExists) {
		Alert.alert('This exercise already exists here');
		return;
	}
	setIsSaving(true);
	try{
		// function from db
		const id = await insertExercise(database, name);
		console.log('Saved exercise with ID:', id);

	// ... syntax copies existing exercises and new one into a new array
	setExercises((current) =>
		[...current, { id, name }].sort((a,b) => a.name.localeCompare(b.name)));
	setExerciseName('');
	}
	catch (error) {
	  console.error('Saving exercse failed:', error);
	  Alert.alert('Save failed', 'Could not save exercise.');
	}
	finally {
	  setIsSaving(false);
	}
  }

  // runs after screen rendering
  // the [] means it doesn't depend on changing values
  useEffect(() => {
    initializeDatabase()
    .then(async (db) => {
      const rows = await listExercises(db); // function from db
      setExercises(rows);
      const templates = await listWorkoutTemplates(db); // function from db
      setRoutines(templates);
      setDatabase(db);
      console.log('Database ready');
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      Alert.alert('Database error', 'Could not open the exercise database.');
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text>
      Available Routines:
      </Text>
      {routines.length === 0 && <Text>No routines yet.</Text>}
      {routines.map((routine) => (
        <View
        key={routine.id}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
        <Button
          title="View"
          accessibilityLabel={`View ${routine.name}`}
          onPress={() => viewRoutine(routine)}
          disabled={database === null || isSaving}
        />
	      <Text>{routine.name}</Text>
        <Button
          title ="X"
          accessibilityLabel={`Delete ${routine.name}`}
          onPress={() => confirmDeleteRoutine(routine)}
          disabled={database === null || isSaving}
        />
        </View>
      ))}


      <Button // NEW ROUTINE
        title={isSaving ? 'Saving…' : 'Create Routine'}
        onPress={newTemplateMenu}
        disabled={database === null || isSaving}
      />
      <Modal
        visible={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
      >
      <Text>New Workout:</Text>
      <TextInput
        placeholder="Workout routine name:"
        value={templateName}
        onChangeText={setTemplateName}
      />
      <TextInput
        placeholder="Exercise name"
        value={exerciseName}
        onChangeText={setExerciseName}
        editable={database !== null && !isSaving}
      />
      <Button
        title={isSaving ? 'Saving…' : 'Add exercise'}
        onPress={addExercise}
        disabled={database === null || isSaving}
      />
      {exercises.length === 0 && <Text>No exercises yet.</Text>}
      {exercises.map((exercise) => (
        <View
          key={exercise.id}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}
        >
        <Button
	  title={exercise.name}
	  onPress={() => addExerciseToWorkout(exercise.id)}
        />
        <Button
          title="X"
          accessibilityLabel={`Delete ${exercise.name} from library`}
          onPress={() => confirmDeleteExercise(exercise)}
          disabled={database === null || isSaving}
        />
        </View>
      ))}
      <Text>Selected Exercise IDs :{selectedExerciseIds.join(', ')}</Text>
        <Button
	  title={isSaving ? 'Saving...' : 'Save Routine'}
	  onPress={() => addRoutine()}
	  disabled={database === null || isSaving}
	 />
      


      <Button title="Cancel" onPress={() => setIsModalOpen(false)} />
      </Modal>
      <Modal
        visible={viewedRoutine !== null}
        transparent
        animationType="fade"
        onRequestClose={closeRoutineView}
      >
        <View style={styles.viewBackdrop}>
          <View style={styles.viewDialog}>
            <Text style={styles.viewTitle}>{viewedRoutine?.name}</Text>
            <ScrollView style={styles.viewList}>
              {isViewingLoading && <Text>Loading exercises…</Text>}
              {viewError !== null && <Text>{viewError}</Text>}
              {!isViewingLoading && viewError === null && (
                viewedExercises.length === 0
                  ? <Text>No exercises in this routine.</Text>
                  : viewedExercises.map((exercise, index) => (
                      <Text key={exercise.id} style={styles.viewExercise}>
                        {index + 1}. {exercise.name} — {exercise.prescribed_sets} {exercise.prescribed_sets === 1 ? 'set' : 'sets'}
                      </Text>
                    ))
              )}
            </ScrollView>
            <Button title="Close" onPress={closeRoutineView} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  viewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewDialog: {
    width: '85%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  viewTitle: {
    fontSize: 22,
    marginBottom: 16,
  },
  viewList: {
    flexGrow: 0,
    marginBottom: 16,
  },
  viewExercise: {
    fontSize: 16,
    marginBottom: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#ababab',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
