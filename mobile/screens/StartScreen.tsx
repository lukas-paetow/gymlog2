import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';
import { initializeDatabase, insertExercise, listExercises } from '../database';
import type { Exercise } from '../database';
import type { TrainingDay } from '../database';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;

export default function StartScreen({ navigation }: Props) {


  return (
    <View style={styles.container}>
      <Button
        title="Exercise library"
        onPress={() => navigation.navigate('ExerciseLibrary')}
      />
      <Button
        title="Routines "
        onPress={() => navigation.navigate('Routines')}
      />
      <Button
        title="Start Workout Session"
        onPress={() => navigation.navigate('Session')}
      />

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
