import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StartScreen from './screens/StartScreen';
import ExerciseLibraryScreen from './screens/ExerciseLibraryScreen';

type RootStackParamList = {
  Start: undefined;
  ExerciseLibrary: undefined;
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
