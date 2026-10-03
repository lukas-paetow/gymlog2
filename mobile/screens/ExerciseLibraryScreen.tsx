import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, TextInput, Button, View, Alert, Modal } from 'react-native';
import { useEffect, useState } from 'react';



export default function ExerciseLibraryScreen() {
  return (
    <View style={styles.container}>
      <Text>Gymlog library screen </Text>
    </View>
  )
}




const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ababab',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
