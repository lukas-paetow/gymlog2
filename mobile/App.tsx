import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, Button, View, Alert } from 'react-native';
import { useState } from 'react';

export default function App() {

  const [exerciseName, setExerciseName] = useState('');

  // string[] is an array of strings
  const [exercises, setExercises] = useState<string[]>([]);

  function addExercise() {
	const name = exerciseName.trim();
	if (name.length==0) {
		Alert.alert('Please enter an exercise name');
		return;
	}
	
	const alreadyExists = exercises.some(
		//no {} around the following: result is immediately returned
		// === is check without type conversion
		// (exercise) is one entry from array
		(exercise) => exercise.toLowerCase() === name.toLowerCase()
	);
	if (alreadyExists) {
		Alert.alert('This exercise already exists here');
		return;
	}

	console.log('Adding exercise:', exerciseName);
	// ... syntax copies existing exercises and new one into a new array
	setExercises([...exercises, exerciseName].sort((a,b) => a.localeCompare(b)));
  }

  return (
    <View style={styles.container}>
      <Text>Gymlog Start Page</Text>
      <TextInput 
      	placeholder="Exercise name" 
	value={exerciseName}
	onChangeText={setExerciseName}
      />
      <Button title="Add exercise" onPress={addExercise} /> 
      <Text>You typed: {exerciseName}</Text>
      {exercises.length === 0 && <Text>No exercises yet.</Text>}
      {exercises.map((exercise) => (
	      <Text key={exercise}>{exercise}</Text>
      ))}
      <StatusBar style="auto" />
    </View>
      // && means: if true, show text on the right
      // addExercise() in onPress would call while rendering, like passing a return value
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
