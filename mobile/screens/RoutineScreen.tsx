import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';

import { initializeDatabase, insertExercise, insertWorkoutTemplate, listExercises, listWorkoutTemplates } from '../database';
import type { Exercise } from '../database';
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

  // open modal and create new routine
  function newTemplateMenu() {
	setTemplateName('');
	setSelectedExerciseIds([]);
	setIsModalOpen(true);
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
	      <Text key={routine.id}>{routine.name}</Text>
      ))}
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
      <Text>You typed: {exerciseName}</Text>
      {exercises.length === 0 && <Text>No exercises yet.</Text>}
      {exercises.map((exercise) => (
        <Text key={exercise.id}>{exercise.name}</Text>
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
      {exercises.map((exercise) => (
        <Button
	  key={exercise.id}
	  title={exercise.name}
	  onPress={() => addExerciseToWorkout(exercise.id)}
        />
      ))}
      <Text>Selected Exercise IDs :{selectedExerciseIds.join(', ')}</Text>
        <Button
	  title={isSaving ? 'Saving...' : 'Save Routine'}
	  onPress={() => addRoutine()}
	  disabled={database === null || isSaving}
	 />
      


      <Button title="Cancel" onPress={() => setIsModalOpen(false)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ababab',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
