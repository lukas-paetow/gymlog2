import { render } from '@testing-library/react-native';
import App from '../App';

jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: (props: { name: string; component: unknown }) => {
      mockRoutes.push(props);
      return null;
    },
  }),
}));
jest.mock('../screens/StartScreen', () => jest.fn(() => null));
jest.mock('../screens/SettingsScreen', () => jest.fn(() => null));
jest.mock('../screens/WorkoutHistoryScreen', () => jest.fn(() => null));
jest.mock('../screens/ExerciseLibraryScreen', () => jest.fn(() => null));
jest.mock('../screens/RoutineScreen', () => jest.fn(() => null));
jest.mock('../screens/SessionScreen', () => jest.fn(() => null));
jest.mock('../screens/ActiveSessionScreen', () => jest.fn(() => null));
const mockRoutes: { name: string; component: unknown }[] = [];

test('registers all task screens with Home first', async () => {
  await render(<App />);
  expect(mockRoutes.map(route => route.name)).toEqual([
    'Start', 'Settings', 'WorkoutHistory', 'ExerciseLibrary', 'Session', 'Routines', 'ActiveSession',
  ]);
  for (const route of mockRoutes) expect(typeof route.component).toBe('function');
});
