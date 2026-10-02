import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';
import { initializeDatabase, insertExercise, listExercises } from './database';
import type { Exercise } from './database';
import type { WorkoutTemplate } from './database';
import type { SQLiteDatabase } from 'expo-sqlite';

export default function App() {

  const [exerciseName, setExerciseName] = useState('');

  // Each exercise retains its database ID and name.
  const [exercises, setExercises] = useState<Exercise[]>([]);

  // this state is just about the connection to the db
  // a database connection OR none yet
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  function addWorkoutTemplate() {
	if (database === null || isSaving) {
		return;
	}
	setIsModalOpen(true);
	}

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
      const rows = await listExercises(db);
      setExercises(rows);
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
      <Text>Gymlog Start Page</Text>
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

      <Button
        title={isSaving ? 'Saving…' : 'Create Routine'}
	onPress={addWorkoutTemplate}
	disabled={database === null || isSaving}
      />
      <Modal
        visible={isModalOpen}
	onRequestClose={() => setIsModalOpen(false)}
      >
      <Text>Test</Text>
      </Modal>

      <StatusBar style="auto" />
    </View>
      // && means: if true, show text on the right
      // addExercise() in onPress would call while rendering, like passing a return value
      // button disabled until db initialized - which happens after rendering
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
