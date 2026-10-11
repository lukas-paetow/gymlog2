import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, ScrollView, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';
import { createLoggedSession, initializeDatabase, listRoutines, listTrainingDays } from '../database'
import { Routine, TrainingDay} from '../database'
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Session'>;

type RoutineWithDays = {
  routine: Routine;
  days: TrainingDay[];
};


export default function SessionScreen({ navigation }: Props) {
  
  const [routinesWithDays, setRoutinesWithDays] = useState<RoutineWithDays[]>([]); // the initial value is at the end
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);


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
      

  async function startWorkout() {
    if (selectedDay === null) return;
    console.log('Starting workout for:', selectedDay.name);
    try {
        const db = await initializeDatabase();
        const sessionId = await createLoggedSession(db, selectedDay.id);
        navigation.navigate('ActiveSession', { sessionId });
    } catch (error) {
        console.error('Starting workout failed:', error);
        Alert.alert('Start failed', 'Could not start the workout.');
    }
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
