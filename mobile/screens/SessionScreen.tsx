import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, ScrollView, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';
import { initializeDatabase, listRoutines, listTrainingDays } from '../database'
import { Routine, TrainingDay} from '../database'

type RoutineWithDays = {
  routine: Routine;
  days: TrainingDay[];
};

export default function SessionScreen() {
  
  const [routinesWithDays, setRoutinesWithDays] = useState<RoutineWithDays[]>([]); // the initial value is at the end
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);


  const startedAt = new Date().toISOString();

  useEffect(() => {
    let cancelled = false;
    async function loadRoutines() {
      try {
        const db = await initializeDatabase();
        const routines = await listRoutines(db);
        const contents = await Promise.all(
          routines.map(async routine => ({ routine, days: await listTrainingDays(db, routine.id) })) // this is where RoutineWithDays comes in
        );

        if (!cancelled) {setRoutinesWithDays(contents); }
      }
      catch (error) {
        console.error('Loading routines failed:', error);
        if(!cancelled) Alert.alert('Load failed', 'Could not load routines.');
      }
    }
    loadRoutines();
    return () => {cancelled = true; };
  }, []);
      
  function startWorkout() {
    if (selectedDay === null) return;
    console.log('Starting workout for:', selectedDay.name);
    //navigation.navigate('ActiveSession', { sessionId });
  }

  return (
    <ScrollView contentContainerStyle={{ padding:20}}>
      {routinesWithDays.map(({ routine, days}) => ( // object desctructuring with ({ })
        <View key={routine.id}> 
          <Text>{routine.name}</Text>
          {days.map(day => (
           <Button key={day.id} 
                   title={day.name}
                   onPress={() => setSelectedDay(day)}
           />
          ))}
        </View>
      ))}
        <View>
          <Button
            title="Start workout"
            disabled={selectedDay === null}
            onPress={startWorkout}
          />
        </View>
    </ScrollView>
  )
}
