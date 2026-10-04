import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StartScreen from './screens/StartScreen';
import ExerciseLibraryScreen from './screens/ExerciseLibraryScreen';
import SessionScreen from './screens/SessionScreen';
import RoutineScreen from './screens/RoutineScreen';

// compile-time visibility when we import this somewhere else. like a struc in c++
// field name: field type. undefined means that this field takes no parameters
export type RootStackParamList = {
  Start: undefined;
  ExerciseLibrary: undefined;
  Session: undefined;
  Routines: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Start" component={StartScreen} /> 
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen}
	  options={{ title: 'Exercise Library' }}
       	/>
        <Stack.Screen name="Session" component={SessionScreen}
	  options={{ title: 'Session' }}
       	/>
        <Stack.Screen name="Routines" component={RoutineScreen}
	  options={{ title: 'Routines' }}
       	/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
