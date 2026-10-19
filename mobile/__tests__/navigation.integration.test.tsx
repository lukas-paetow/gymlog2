import { Alert, BackHandler } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import * as database from '../database';

// Keep React Navigation and all app screens real. Mock only native boundaries and data.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  return (props: object) => React.createElement(require('react-native').View, props);
});
jest.mock('../database', () => ({
  getExerciseWeightOptions: jest.fn(),
  listExercisesWithRecords: jest.fn(), listExerciseProgress: jest.fn(),
  initializeDatabase: jest.fn(), listFinishedWorkouts: jest.fn(), getProgressionMode: jest.fn(), setProgressionMode: jest.fn(), getDateFormat: jest.fn(),
  getResumableSession: jest.fn(), getStartScreenOrder: jest.fn(), setStartScreenOrder: jest.fn(), reorderTrainingDayExercises: jest.fn(), getActiveRoutineId: jest.fn(), setActiveRoutine: jest.fn(), listReusableTrainingDays: jest.fn(), updateExercisePrescription: jest.fn(), listRoutines: jest.fn(), listTrainingDays: jest.fn(),
  createLoggedSession: jest.fn(), getLoggedSession: jest.fn(), listExerciseAnnotations: jest.fn(), saveExerciseAnnotation: jest.fn(), listSetRepRecords: jest.fn(), listLastSetWeights: jest.fn(), listSavedSessionSets: jest.fn(),
  listExercisesInTrainingDay: jest.fn(), finishLoggedSession: jest.fn(),
}));
const db = jest.mocked(database);
let alert: jest.SpyInstance;
let backEvents: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const query of Object.values(db)) if (jest.isMockFunction(query)) query.mockReset();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  backEvents = jest.spyOn(BackHandler, 'addEventListener');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  db.initializeDatabase.mockResolvedValue({} as Awaited<ReturnType<typeof database.initializeDatabase>>);
  db.getDateFormat.mockResolvedValue('DD/MM/YYYY');
  db.getProgressionMode.mockResolvedValue('hypertrophy');
  db.setProgressionMode.mockResolvedValue();
  db.getExerciseWeightOptions.mockResolvedValue({ weights: [], increments: [] });
  db.listFinishedWorkouts.mockResolvedValue([]);
  db.getResumableSession.mockResolvedValue(null);
  db.getStartScreenOrder.mockResolvedValue([]);
  db.setStartScreenOrder.mockResolvedValue();
  db.reorderTrainingDayExercises.mockResolvedValue();
  db.getActiveRoutineId.mockResolvedValue(null);
  db.setActiveRoutine.mockResolvedValue();
  db.listReusableTrainingDays.mockResolvedValue([]);
  db.updateExercisePrescription.mockResolvedValue();
  db.listRoutines.mockResolvedValue([{ id: 1, name: 'Routine' }]);
  db.listTrainingDays.mockResolvedValue([{ id: 2, name: 'Gym day', position: 0, routineId: 1 }]);
  db.createLoggedSession.mockResolvedValue(42);
  db.getLoggedSession.mockResolvedValue({ trainingDayId: 2, trainingDayName: 'Selected gym day', finishTime: null });
  db.listExerciseAnnotations.mockResolvedValue([]);
  db.saveExerciseAnnotation.mockResolvedValue();
  db.listSetRepRecords.mockResolvedValue([]);
  db.listLastSetWeights.mockResolvedValue([]);
  db.listSavedSessionSets.mockResolvedValue([]);
  db.listExercisesInTrainingDay.mockResolvedValue([]);
  db.finishLoggedSession.mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

test('Home → History → Back changes the visible screen', async () => {
  await render(<App />);
  await fireEvent.press(screen.getByRole('button', { name: 'Workout history' }));
  expect(await screen.findByText('No finished workouts yet.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Start Workout Session' })).toBeNull();
  // Native header buttons are not JS children. Deliver the native Back signal
  // to React Navigation's real subscription instead of mocking goBack().
  const listener = backEvents.mock.calls.find(([event]) => event === 'hardwareBackPress')?.[1];
  expect(listener).toBeDefined();
  await act(async () => { expect(listener()).toBe(true); });
  expect(await screen.findByRole('button', { name: 'Start Workout Session' })).toBeVisible();
  expect(screen.queryByText('No finished workouts yet.')).toBeNull();
});

test('Start → ActiveSession → Finish → Done uses real routing and session params', async () => {
  await render(<App />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start Workout Session' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Gym day' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  expect(await screen.findByText('Selected gym day')).toBeVisible();
  expect(db.getLoggedSession).toHaveBeenCalledWith(expect.anything(), 42);
  expect(screen.queryByRole('button', { name: 'Start workout' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
  const finish = alert.mock.calls.at(-1)?.[2].find((button: { text: string }) => button.text === 'Finish');
  await act(async () => { await finish.onPress(); });
  expect(screen.getByText('Workout finished')).toBeVisible();
  expect(db.finishLoggedSession).toHaveBeenCalledWith(expect.anything(), 42);
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('button', { name: 'Start workout' })).toBeVisible();
  expect(screen.queryByText('Workout finished')).toBeNull();
  await waitFor(() => expect(db.getResumableSession).toHaveBeenCalledTimes(2));
});


test('Library → Progress → Back reloads exercise records on returning', async () => {
  const rows = [{ id: 7, name: 'Squat', heaviestWeight: 80, repsAtHeaviestWeight: 8 }];
  let finishRefresh!: (value: typeof rows) => void;
  const refresh = new Promise<typeof rows>(resolve => { finishRefresh = resolve; });
  db.listExercisesWithRecords.mockResolvedValueOnce(rows).mockReturnValueOnce(refresh);
  db.listExerciseProgress.mockResolvedValue([]);
  await render(<App />);
  await fireEvent.press(screen.getByRole('button', { name: 'Exercise library' }));
  await screen.findByRole('button', { name: 'View progress for Squat' });
  await fireEvent.scroll(screen.getByTestId('exercise-library-scroll'), { nativeEvent: { contentOffset: { y: 600 } } });
  await fireEvent(await screen.findByRole('button', { name: 'View progress for Squat' }), 'longPress');
  expect(await screen.findByText('No finished workouts with a recorded weight yet.')).toBeVisible();
  const listener = backEvents.mock.calls.filter(([event]) => event === 'hardwareBackPress').at(-1)?.[1];
  await act(async () => { expect(listener()).toBe(true); });
  await waitFor(() => expect(db.listExercisesWithRecords).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'View progress for Squat' })).toBeVisible();
  expect(screen.queryByText('Loading records…')).toBeNull();
  await act(async () => finishRefresh(rows));
  expect(await screen.findByRole('button', { name: 'View progress for Squat' })).toBeVisible();
  expect(screen.queryByText('Could not load exercise records.')).toBeNull();
});
