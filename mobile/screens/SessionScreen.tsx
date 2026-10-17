import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, ScrollView, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getActiveRoutineId, getResumableSession, createLoggedSession, initializeDatabase, listRoutines, listTrainingDays } from '../database'
import { Routine, TrainingDay, UnfinishedSession} from '../database'
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Session'>;

type RoutineWithDays = {
  routine: Routine;
  days: TrainingDay[];
};


export default function SessionScreen({ navigation }: Props) {
  
  const [routinesWithDays, setRoutinesWithDays] = useState<RoutineWithDays[]>([]); // the initial value is at the end
  const [activeRoutineId, setActiveRoutineId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<TrainingDay | null>(null);


  const openingRef = useRef(false);
  const [isOpening, setIsOpening] = useState(false);
  const [resumableSession, setResumableSession] = useState<UnfinishedSession | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    async function loadRoutines() {
      try {
        const db = await initializeDatabase();
        const unfinished = await getResumableSession(db);
        const routines = await listRoutines(db);
        const activeId = await getActiveRoutineId(db);
        routines.sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
        const contents = await Promise.all(
          routines.map(async routine => ({ routine, days: await listTrainingDays(db, routine.id) })) // this is where RoutineWithDays comes in
        );

        if (!cancelled) {
          setRoutinesWithDays(contents);
          setActiveRoutineId(activeId);
          setResumableSession(unfinished);
          setSelectedDay(current => current && contents.some(entry => entry.days.some(day => day.id === current.id)) ? current : null);
        }
      }
      catch (error) {
        console.error('Loading routines failed:', error);
        if(!cancelled) Alert.alert('Load failed', 'Could not load routines.');
      }
    }
    loadRoutines();
    return () => {cancelled = true; };
  }, []));
      

  async function startWorkout() {
    if (selectedDay === null || openingRef.current) return;
    openingRef.current = true;
    setIsOpening(true);
    console.log('Starting workout for:', selectedDay.name);
    try {
        const db = await initializeDatabase();
        const sessionId = await createLoggedSession(db, selectedDay.id);
        navigation.navigate('ActiveSession', { sessionId });
    } catch (error) {
        console.error('Starting workout failed:', error);
        Alert.alert('Start failed', 'Could not start the workout.');
    } finally {
        openingRef.current = false;
        setIsOpening(false);
    }
}


  async function resumeWorkout() {
    if (openingRef.current) return;
    openingRef.current = true;
    setIsOpening(true);
    try {
      const db = await initializeDatabase();
      // Recheck the time window in case this screen has been open for hours.
      const session = await getResumableSession(db);
      setResumableSession(session);
      if (session) navigation.navigate('ActiveSession', { sessionId: session.id });
      else Alert.alert('Resume unavailable', 'There is no unfinished workout from the last six hours.');
    } catch (error) {
      console.error('Resuming workout failed:', error);
      Alert.alert('Resume failed', 'Could not load the workout.');
    } finally {
      openingRef.current = false;
      setIsOpening(false);
    }
  }


  return (
    <ScrollView contentContainerStyle={{ padding:20}}>
      {resumableSession !== null && (
        <View style={{ gap: 12, marginBottom: 24 }}>
          <Button title="Resume workout" onPress={resumeWorkout} disabled={isOpening} />
        </View>
      )}
      {routinesWithDays.map(({ routine, days}) => ( // object desctructuring with ({ })
        <View key={routine.id}> 
          <Text>{routine.name}</Text>
          {routine.id === activeRoutineId && <Text>Active routine</Text>}
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
            disabled={selectedDay === null || isOpening}
            onPress={startWorkout}
          />
        </View>
    </ScrollView>
  )
}
