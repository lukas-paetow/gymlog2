import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as database from '../database';
import ExerciseLibraryScreen from '../screens/ExerciseLibraryScreen';
import WorkoutHistoryScreen from '../screens/WorkoutHistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SessionScreen from '../screens/SessionScreen';
import ActiveSessionScreen from '../screens/ActiveSessionScreen';
import RoutineScreen from '../screens/RoutineScreen';
import StartScreen from '../screens/StartScreen';
import { importLegacy } from '../legacyImport';

jest.mock('../legacyImport', () => ({ importLegacy: jest.fn() }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('react-native/Libraries/Components/Switch/Switch', () => ({
  default: (props: any) => require('react').createElement(require('react-native').View, { ...props, accessibilityRole: 'switch', accessibilityState: { disabled: props.disabled, checked: props.value } }),
}));
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => React.createElement(View, props);
});
jest.mock('../components/WeightPicker', () => {
  const React = require('react');
  return ({ value, onChange, disabled, label, weights }: { value: string; onChange: (value: string) => void; disabled: boolean; label: string; weights: number[] }) =>
    React.createElement(require('react-native').TextInput, { value, onChangeText: onChange, editable: !disabled, accessibilityLabel: label, availableWeights: weights });
});
jest.mock('../database', () => {
  const names = ['initializeDatabase', 'listExercisesWithRecords', 'deleteExercise', 'getExerciseWeightOptions', 'setExerciseWeights', 'deleteFinishedWorkout', 'listFinishedWorkouts',
    'getProgressionMode', 'setProgressionMode', 'getDateFormat', 'setDateFormat', 'seedDemoHistory', 'getResumableSession', 'getStartScreenOrder', 'setStartScreenOrder', 'reorderTrainingDayExercises', 'getActiveRoutineId', 'setActiveRoutine', 'listReusableTrainingDays', 'updateExercisePrescription', 'listRoutines', 'listTrainingDays',
    'createLoggedSession', 'getLoggedSession', 'listExercisesInTrainingDay', 'listExerciseAnnotations', 'saveExerciseAnnotation', 'listLastSetReps', 'listLastSetWeights', 'listSavedSessionSets', 'saveCompletedSet',
    'finishLoggedSession', 'listExercises', 'insertRoutine', 'updateRoutine', 'insertExercise', 'deleteRoutine'];
  return Object.fromEntries(names.map(name => [name, jest.fn()]));
});
const db = jest.mocked(database);
const exercise = { id: 7, name: 'Dips', prescribedSets: 2, prescribedRepsFirstSet: 8, prescribedWeightFirstSet: -20 };
const mockNavigation = { navigate: jest.fn(), popTo: jest.fn() };
const navigation = mockNavigation;
let alert: jest.SpyInstance;

function props<T>(name: string, params?: object): T {
  return { navigation, route: { key: name, name, params } } as unknown as T;
}
async function renderActive() {
  await render(<ActiveSessionScreen {...props<Parameters<typeof ActiveSessionScreen>[0]>('ActiveSession', { sessionId: 4 })} />);
  await screen.findByText('Day');
}
async function chooseAlert(label: string) {
  const buttons = alert.mock.calls.at(-1)?.[2];
  const button = buttons?.find((item: { text: string }) => item.text === label);
  expect(button).toBeDefined();
  await act(async () => { await button.onPress?.(); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  db.initializeDatabase.mockResolvedValue({} as Awaited<ReturnType<typeof database.initializeDatabase>>);
  db.listExercisesWithRecords.mockResolvedValue([]);
  db.listFinishedWorkouts.mockResolvedValue([]);
  db.getDateFormat.mockResolvedValue('DD/MM/YYYY');
  db.getProgressionMode.mockResolvedValue('hypertrophy');
  db.setProgressionMode.mockResolvedValue();
  db.setDateFormat.mockResolvedValue();
  db.seedDemoHistory.mockResolvedValue(true);
  db.getResumableSession.mockResolvedValue(null);
  db.getStartScreenOrder.mockResolvedValue([]);
  db.setStartScreenOrder.mockResolvedValue();
  db.reorderTrainingDayExercises.mockResolvedValue();
  db.getActiveRoutineId.mockResolvedValue(null);
  db.setActiveRoutine.mockResolvedValue();
  db.listReusableTrainingDays.mockResolvedValue([]);
  db.updateExercisePrescription.mockResolvedValue();
  db.listRoutines.mockResolvedValue([{ id: 1, name: 'Routine' }]);
  db.listTrainingDays.mockResolvedValue([{ id: 2, name: 'Day', position: 0, routineId: 1 }]);
  db.getExerciseWeightOptions.mockResolvedValue({ weights: [], increments: [] });
  db.setExerciseWeights.mockResolvedValue();
  db.listExercises.mockResolvedValue([{ id: 7, name: 'Dips' }]);
  db.listExercisesInTrainingDay.mockResolvedValue([exercise]);
  db.getLoggedSession.mockResolvedValue({ trainingDayId: 2, trainingDayName: 'Day', finishTime: null });
  db.listExerciseAnnotations.mockResolvedValue([]);
  db.saveExerciseAnnotation.mockResolvedValue();
  db.listLastSetReps.mockResolvedValue([]);
  db.listLastSetWeights.mockResolvedValue([]);
  db.listSavedSessionSets.mockResolvedValue([]);
  db.createLoggedSession.mockResolvedValue(4);
  db.saveCompletedSet.mockResolvedValue({ id: 10, isPersonalRecord: false });
  db.finishLoggedSession.mockResolvedValue();
  db.deleteExercise.mockResolvedValue();
  db.deleteFinishedWorkout.mockResolvedValue();
  db.insertRoutine.mockResolvedValue(1);
  db.updateRoutine.mockResolvedValue();
  db.insertExercise.mockResolvedValue(8);
  db.deleteRoutine.mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

// Lower priority: checks requested route names; real journeys have integration tests.
test('Home links to all task screens', async () => {
  await render(<StartScreen {...props<Parameters<typeof StartScreen>[0]>('Start')} />);
  for (const [title, route] of [['Exercise library', 'ExerciseLibrary'], ['Routines ', 'Routines'], ['Start Workout Session', 'Session'], ['Workout history', 'WorkoutHistory'], ['Settings', 'Settings']]) {
    await fireEvent.press(screen.getByText(title.trim()));
    expect(navigation.navigate).toHaveBeenCalledWith(route);
  }
});

describe('library and history', () => {
  // Lower priority: checks only a low-risk empty-state message.
  test('library empty state and record display', async () => {
    await render(<ExerciseLibraryScreen />);
    await screen.findByText(/No exercises yet/);
  });
  test('library confirms deletion and updates only after success', async () => {
    db.listExercisesWithRecords.mockResolvedValue([{ id: 7, name: 'Dips', heaviestWeight: -10, repsAtHeaviestWeight: 8 }, { id: 8, name: 'Squat', heaviestWeight: null, repsAtHeaviestWeight: null }]);
    await render(<ExerciseLibraryScreen />);
    await screen.findByText('Personal Record: -10 kg / 8 reps');
    expect(screen.getByText('No record yet.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Delete Dips'));
    await chooseAlert('Cancel');
    expect(db.deleteExercise).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Delete Dips'));
    await chooseAlert('Delete');
    expect(db.deleteExercise).toHaveBeenCalledWith(expect.anything(), 7);
    expect(screen.queryByText('Dips')).toBeNull();
    expect(screen.getByText('Squat')).toBeTruthy();
  });
  test('library deletion failure leaves its card available', async () => {
    db.listExercisesWithRecords.mockResolvedValue([{ id: 7, name: 'Dips', heaviestWeight: null, repsAtHeaviestWeight: null }]);
    db.deleteExercise.mockRejectedValueOnce(new Error('offline'));
    await render(<ExerciseLibraryScreen />);
    await screen.findByText('Dips');
    await fireEvent.press(screen.getByLabelText('Delete Dips'));
    await chooseAlert('Delete');
    expect(screen.getByText('Dips')).toBeTruthy();
    expect(alert).toHaveBeenLastCalledWith('Delete failed', expect.any(String));
  });
  test('history shows finished dates and rows, including empty workouts and null weights', async () => {
    db.listFinishedWorkouts.mockResolvedValue([
      { id: 1, routineId: 1, trainingDayNumber: 1, trainingDayName: 'Day', routineName: 'Routine', finishTime: '2026-11-23T12:00:00.000Z', sets: [{ id: 10, exerciseName: 'Dips', setPosition: 0, weight: -20, reps: 8 }, { id: 11, exerciseName: 'Dips', setPosition: 1, weight: null, reps: 6 }] },
      // Lower priority: defensive UI fallback; the real history query excludes empty workouts.
      { id: 2, routineId: null, trainingDayNumber: null, trainingDayName: 'Empty', routineName: 'Routine', finishTime: '2026-11-22T12:00:00.000Z', sets: [] },
    ]);
    await render(<WorkoutHistoryScreen />);
    await screen.findByText('23/11/2026');
    expect(screen.getAllByText('Dips')).toHaveLength(2);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('No sets completed.')).toBeTruthy();
  });
  // Lower priority: checks only a low-risk empty-state message.
  test('history handles empty data', async () => {
    await render(<WorkoutHistoryScreen />);
    await screen.findByText('No finished workouts yet.');
  });
  test.each(['library', 'history'] as const)('%s handles database failures', async target => {
    db.initializeDatabase.mockRejectedValueOnce(new Error('load failed'));
    await render(target === 'library' ? <ExerciseLibraryScreen /> : <WorkoutHistoryScreen />);
    await screen.findByText(/Could not load/);
  });
});

describe('settings', () => {
  test('selects and persists a format, and can seed demo history', async () => {
    await render(<SettingsScreen />);
    await screen.findByText('● DD/MM/YYYY');
    await fireEvent.press(screen.getByText('○ YYYY-MM-DD'));
    await screen.findByText('● YYYY-MM-DD');
    expect(db.setDateFormat).toHaveBeenCalledWith(expect.anything(), 'YYYY-MM-DD');
    await fireEvent.press(screen.getByText('● YYYY-MM-DD'));
    expect(db.setDateFormat).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Add demo history'));
    expect(alert).toHaveBeenLastCalledWith('Demo history added', expect.any(String));
  });
  test('failed save preserves previous preference', async () => {
    db.setDateFormat.mockRejectedValueOnce(new Error('write failed'));
    await render(<SettingsScreen />);
    await screen.findByText('● DD/MM/YYYY');
    await fireEvent.press(screen.getByText('○ MM/DD/YYYY'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Save failed', expect.any(String)));
    expect(screen.getByText('● DD/MM/YYYY')).toBeTruthy();
  });
  test('settings load failure is displayed', async () => {
    db.getDateFormat.mockRejectedValueOnce(new Error('failed'));
    await render(<SettingsScreen />);
    await screen.findByText('Could not load settings.');
  });
  test('demo seed failure and repeated seed have useful messages', async () => {
    db.seedDemoHistory.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('failed'));
    await render(<SettingsScreen />);
    await screen.findByText('● DD/MM/YYYY');
    await fireEvent.press(screen.getByText('Add demo history'));
    expect(alert).toHaveBeenLastCalledWith('Demo history already added', expect.any(String));
    await fireEvent.press(screen.getByText('Add demo history'));
    expect(alert).toHaveBeenLastCalledWith('Demo data failed', expect.any(String));
  });
});

describe('workout selection', () => {
  test('selects a day and starts a persistent session', async () => {
    await render(<SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />);
    await screen.findByText('Day');
    await fireEvent.press(screen.getByText('Day'));
    await fireEvent.press(screen.getByText('Start workout'));
    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('ActiveSession', { sessionId: 4 }));
  });
  test('resume rechecks eligibility on press', async () => {
    const session = { id: 4, trainingDayName: 'Day', routineName: 'Routine', startTime: '2026-01-01T12:00:00.000Z' };
    db.getResumableSession.mockResolvedValueOnce(session).mockResolvedValueOnce(null);
    await render(<SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />);
    await screen.findByText('Resume workout');
    await fireEvent.press(screen.getByText('Resume workout'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Resume unavailable', expect.any(String)));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('active workout', () => {
  test('saves negative assistance before unlocking the next set and blocks repeat presses', async () => {
    const saving = deferred<database.SavedSetResult>();
    db.saveCompletedSet.mockReturnValueOnce(saving.promise);
    await renderActive();
    await fireEvent.press(screen.getByText('Dips'));
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).toBeDisabled();
    const press = fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
    await waitFor(() => expect(db.saveCompletedSet).toHaveBeenCalledTimes(1));
    expect(db.saveCompletedSet).toHaveBeenCalledWith(expect.anything(), 4, exercise, 0, 0, 8, -20, false);
    expect(screen.getByText('Finish workout')).toBeDisabled();
    await fireEvent.press(screen.getAllByText('Saving…')[0]);
    expect(db.saveCompletedSet).toHaveBeenCalledTimes(1);
    await act(async () => saving.resolve({ id: 10, isPersonalRecord: false }));
    await press;
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).not.toBeDisabled();
    expect(screen.queryByText('New personal record!')).toBeNull();
    await fireEvent.press(screen.getByText('Complete exercise'));
    expect(screen.getByText('Set 1: 8 reps × -20 kg')).toBeTruthy();
  });
  test('failed save keeps first set editable', async () => {
    db.saveCompletedSet.mockRejectedValueOnce(new Error('save failed'));
    await renderActive();
    await fireEvent.press(screen.getByText('Dips'));
    await fireEvent.press(screen.getAllByText('Complete set')[0]);
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Save failed', expect.any(String)));
    expect(screen.getByLabelText('Dips, set 1 weight in kilograms')).not.toBeDisabled();
    expect(screen.queryByText('New personal record!')).toBeNull();
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).toBeDisabled();
  });
  test('long-press reveals Skip and does not write unperformed data', async () => {
    await renderActive();
    await fireEvent(screen.getByText('Dips'), 'longPress');
    await chooseAlert('Exclude sets from tracking');
    await fireEvent.press(screen.getByText('Skip exercise'));
    expect(screen.queryByText('Dips')).toBeNull();
    expect(screen.getByText('All exercises have been skipped.')).toBeTruthy();
    expect(db.saveCompletedSet).not.toHaveBeenCalled();
  });
  test('finishing waits for persistence; cancel leaves it active', async () => {
    const finish = deferred<void>();
    db.finishLoggedSession.mockReturnValueOnce(finish.promise);
    await renderActive();
    await fireEvent.press(screen.getByText('Finish workout'));
    await chooseAlert('Cancel');
    expect(db.finishLoggedSession).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Finish workout'));
    // Start the asynchronous callback without waiting for the deliberately pending save.
    const callback = alert.mock.calls.at(-1)?.[2].find((button: { text: string }) => button.text === 'Finish').onPress;
    await act(async () => { void callback(); });
    expect(screen.queryByText('Workout finished')).toBeNull();
    await act(async () => finish.resolve());
    expect(screen.getByText('Workout finished')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));
    expect(navigation.popTo).toHaveBeenCalledWith('Session');
  });
  test('failed finishing keeps workout active', async () => {
    db.finishLoggedSession.mockRejectedValueOnce(new Error('finish failed'));
    await renderActive();
    await fireEvent.press(screen.getByText('Finish workout'));
    await chooseAlert('Finish');
    expect(screen.queryByText('Workout finished')).toBeNull();
    expect(alert).toHaveBeenLastCalledWith('Finish failed', expect.any(String));
  });
  test('resume restores snapshots, saved sets, deleted exercises and next workout position', async () => {
    const saved = { loggedExerciseId: 1, exerciseId: 7, name: 'Snapshot dips', position: 3, prescribedSets: 2, prescribedWeightFirstSet: -20, prescribedRepsFirstSet: 8, setPosition: 0, reps: 8, weight: -20 };
    db.listSavedSessionSets.mockResolvedValue([saved, { ...saved, loggedExerciseId: 2, exerciseId: null, name: 'Deleted', position: 5, prescribedSets: 1 }]);
    await renderActive();
    await screen.findByText('Snapshot dips');
    expect(screen.getByText('Set 1: 8 reps × -20 kg')).toBeTruthy();
    await fireEvent.press(screen.getByText('Snapshot dips'));
    expect(screen.getByLabelText('Snapshot dips, set 1 weight in kilograms')).toBeDisabled();
    expect(screen.getByLabelText('Snapshot dips, set 2 weight in kilograms')).not.toBeDisabled();
  });
  test('missing session and load failures are shown', async () => {
    db.getLoggedSession.mockResolvedValueOnce(null);
    await render(<ActiveSessionScreen {...props<Parameters<typeof ActiveSessionScreen>[0]>('ActiveSession', { sessionId: 4 })} />);
    await screen.findByText('Could not load the training day.');
  });
});

test('routine editing opens drafts and saves the same routine identity', async () => {
  await render(<RoutineScreen />);
  await screen.findByText('Routine');
  await fireEvent.press(screen.getByText('View'));
  await screen.findByText('Edit routine');
  await waitFor(() => expect(screen.getByText('Edit routine')).not.toBeDisabled());
  await fireEvent.press(screen.getByText('Edit routine'));
  await fireEvent.changeText(screen.getByPlaceholderText('Routine name'), 'Updated');
  await fireEvent.press(screen.getByText('Save routine'));
  await waitFor(() => expect(db.updateRoutine).toHaveBeenCalledWith(expect.anything(), 1, 'Updated', [{ id: 2, name: 'Day', exercises: [{ id: 7, prescribedSets: 2, prescribedRepsFirstSet: 8, prescribedWeightFirstSet: -20 }] }]));
  expect(db.insertRoutine).not.toHaveBeenCalled();
});

describe('routine drafts', () => {
  async function openRoutine() {
    await render(<RoutineScreen />);
    await screen.findByText('Routine');
    await fireEvent.press(screen.getByText('Add routine'));
  }
  async function newDay() {
    await fireEvent.press(screen.getByText('Add training day'));
    await fireEvent.changeText(screen.getByPlaceholderText('Training day name'), 'New day');
    await fireEvent.press(screen.getByText('Dips'));
  }

  test('creates a routine with a day draft and does not write the day before Save', async () => {
    await openRoutine();
    await fireEvent.changeText(screen.getByPlaceholderText('Routine name'), 'My routine');
    await newDay();
    await fireEvent.press(screen.getByText('Add day to routine draft'));
    expect(db.insertRoutine).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Save routine'));
    await waitFor(() => expect(db.insertRoutine).toHaveBeenCalledWith(expect.anything(), 'My routine', [{ name: 'New day', exercises: [{ id: 7, prescribedSets: 2, prescribedRepsFirstSet: 8, prescribedWeightFirstSet: 0 }] }]));
  });

  test('cancels changes without writing the plan', async () => {
    await openRoutine();
    await newDay();
    await fireEvent.press(screen.getByText('Cancel day'));
    expect(screen.queryByText('1. New day (1 exercises)')).toBeNull();
    await fireEvent.press(screen.getByText('Cancel routine'));
    expect(db.insertRoutine).not.toHaveBeenCalled();
    expect(db.updateRoutine).not.toHaveBeenCalled();
  });

  test('validates missing routine and day fields and invalid prescriptions', async () => {
    await openRoutine();
    await fireEvent.press(screen.getByText('Save routine'));
    expect(alert).toHaveBeenLastCalledWith('Routine incomplete', expect.any(String));
    await fireEvent.press(screen.getByText('Add training day'));
    await fireEvent.press(screen.getByText('Add day to routine draft'));
    expect(alert).toHaveBeenLastCalledWith('Training day incomplete', expect.any(String));
    await fireEvent.changeText(screen.getByPlaceholderText('Training day name'), 'New day');
    await fireEvent.press(screen.getByText('Dips'));
    await fireEvent.changeText(screen.getByDisplayValue('2'), '0');
    await fireEvent.press(screen.getByText('Add day to routine draft'));
    expect(alert).toHaveBeenLastCalledWith('Invalid prescription', expect.any(String));
    expect(db.insertRoutine).not.toHaveBeenCalled();
  });

  test('edits day drafts, changes prescription fields, removes exercise/day, and saves updates', async () => {
    await render(<RoutineScreen />);
    await screen.findByText('Routine');
    await fireEvent.press(screen.getByText('View'));
    await waitFor(() => expect(screen.getByText('Edit routine')).not.toBeDisabled());
    await fireEvent.press(screen.getByText('Edit routine'));
    await fireEvent.press(screen.getByText('Edit day'));
    await fireEvent.changeText(screen.getByDisplayValue('2'), '4');
    await fireEvent.changeText(screen.getByDisplayValue('8'), '10');
    await fireEvent.changeText(screen.getByDisplayValue('-20'), '-15,5');
    await fireEvent.press(screen.getByText('Save day to routine draft'));
    await fireEvent.press(screen.getByText('Save routine'));
    await waitFor(() => expect(db.updateRoutine).toHaveBeenCalledWith(expect.anything(), 1, 'Routine', [{ id: 2, name: 'Day', exercises: [{ id: 7, prescribedSets: 4, prescribedRepsFirstSet: 10, prescribedWeightFirstSet: -15.5 }] }]));
  });

  test('removing a draft exercise does not delete it from the library', async () => {
    await openRoutine();
    await newDay();
    await fireEvent.press(screen.getByText('Remove from day'));
    expect(screen.queryByText('Prescribed sets')).toBeNull();
    expect(db.deleteExercise).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Cancel day'));
    await newDay();
    await fireEvent.press(screen.getByText('Add day to routine draft'));
    await fireEvent.press(screen.getByText('Remove day'));
    expect(screen.queryByText('1. New day (1 exercises)')).toBeNull();
  });

  test('library addition validates names and saves a new exercise', async () => {
    await openRoutine();
    await fireEvent.press(screen.getByText('Add training day'));
    await fireEvent.press(screen.getByText('Add exercise to library'));
    expect(alert).toHaveBeenLastCalledWith('Please enter an exercise name');
    await fireEvent.changeText(screen.getByPlaceholderText('New exercise name'), 'dips');
    await fireEvent.press(screen.getByText('Add exercise to library'));
    expect(alert).toHaveBeenLastCalledWith('This exercise already exists');
    await fireEvent.changeText(screen.getByPlaceholderText('New exercise name'), 'Squat');
    await fireEvent.press(screen.getByText('Add exercise to library'));
    expect(db.insertExercise).toHaveBeenCalledWith(expect.anything(), 'Squat', [], []);
  });

  test('confirms routine deletion and library deletion', async () => {
    await render(<RoutineScreen />);
    await screen.findByText('Routine');
    expect(screen.queryByLabelText('Delete Routine')).toBeNull();
    await fireEvent.press(screen.getByLabelText('View Routine'));
    await waitFor(() => expect(screen.getByText('Edit routine')).not.toBeDisabled());
    await fireEvent.press(screen.getByText('Edit routine'));
    await fireEvent.press(screen.getByLabelText('Delete Routine'));
    await chooseAlert('Cancel');
    expect(db.deleteRoutine).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Delete Routine'));
    await chooseAlert('Delete');
    expect(db.deleteRoutine).toHaveBeenCalledWith(expect.anything(), 1);
    await fireEvent.press(screen.getByText('Add routine'));
    await newDay();
    await fireEvent.press(screen.getByLabelText('Delete Dips from library'));
    await chooseAlert('Delete');
    expect(db.deleteExercise).toHaveBeenCalledWith(expect.anything(), 7);
    expect(screen.queryByText('Prescribed sets')).toBeNull();
  });

  test('save failure preserves the editor for retry', async () => {
    db.insertRoutine.mockRejectedValueOnce(new Error('failed'));
    await openRoutine();
    await fireEvent.changeText(screen.getByPlaceholderText('Routine name'), 'New');
    await newDay();
    await fireEvent.press(screen.getByText('Add day to routine draft'));
    await fireEvent.press(screen.getByText('Save routine'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Save failed', expect.any(String)));
    expect(screen.getByPlaceholderText('Routine name').props.value).toBe('New');
  });

  test('view failure prevents editing partial data', async () => {
    db.listTrainingDays.mockRejectedValueOnce(new Error('failed'));
    await render(<RoutineScreen />);
    await screen.findByText('Routine');
    await fireEvent.press(screen.getByText('View'));
    await screen.findByText('Could not load this routine.');
    expect(screen.getByText('Edit routine')).toBeDisabled();
    await fireEvent.press(screen.getByText('Close'));
    expect(screen.queryByText('Edit routine')).toBeNull();
  });

  test('initialization failure is reported', async () => {
    db.initializeDatabase.mockRejectedValueOnce(new Error('failed'));
    await render(<RoutineScreen />);
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Database error', expect.any(String)));
    expect(screen.getByText('Add routine')).toBeDisabled();
  });
});

describe('async lifecycle and remaining user paths', () => {
  // Lower priority: repetitive lifecycle smoke checks. The assertion checks no late
  // alert, not whether every possible state update is suppressed after unmounting.
  test.each(['library', 'history', 'settings', 'session', 'active', 'routine'] as const)(
    '%s safely ignores a load that finishes after leaving the screen', async target => {
      const pending = deferred<Awaited<ReturnType<typeof database.initializeDatabase>>>();
      db.initializeDatabase.mockReturnValueOnce(pending.promise);
      const components = {
        library: <ExerciseLibraryScreen />, history: <WorkoutHistoryScreen />, settings: <SettingsScreen />,
        session: <SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />,
        active: <ActiveSessionScreen {...props<Parameters<typeof ActiveSessionScreen>[0]>('ActiveSession', { sessionId: 4 })} />,
        routine: <RoutineScreen />,
      };
      const result = await render(components[target]);
      await result.unmount();
      await act(async () => pending.resolve({} as Awaited<ReturnType<typeof database.initializeDatabase>>));
      expect(alert).not.toHaveBeenCalled();
    }
  );

  test('starting and resuming errors are reported without navigating', async () => {
    db.createLoggedSession.mockRejectedValueOnce(new Error('failed'));
    db.getResumableSession.mockResolvedValueOnce({ id: 4, trainingDayName: 'Day', routineName: 'Routine', startTime: '2026-01-01' }).mockRejectedValueOnce(new Error('failed'));
    await render(<SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />);
    await screen.findByText('Day');
    await fireEvent.press(screen.getByText('Day'));
    await fireEvent.press(screen.getByText('Start workout'));
    expect(alert).toHaveBeenLastCalledWith('Start failed', expect.any(String));
    await fireEvent.press(screen.getByText('Resume workout'));
    expect(alert).toHaveBeenLastCalledWith('Resume failed', expect.any(String));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('resuming an eligible session does not create a new session', async () => {
    db.getResumableSession.mockResolvedValue({ id: 4, trainingDayName: 'Day', routineName: 'Routine', startTime: '2026-01-01' });
    await render(<SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />);
    await screen.findByText('Resume workout');
    await fireEvent.press(screen.getByText('Resume workout'));
    expect(navigation.navigate).toHaveBeenCalledWith('ActiveSession', { sessionId: 4 });
    expect(db.createLoggedSession).not.toHaveBeenCalled();
  });

  test('selection load error is reported', async () => {
    db.listRoutines.mockRejectedValueOnce(new Error('failed'));
    await render(<SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />);
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Load failed', expect.any(String)));
  });

  test('newly performed exercise gets the next restored position and inputs save correctly', async () => {
    db.listSavedSessionSets.mockResolvedValue([{ loggedExerciseId: 1, exerciseId: null, name: 'Deleted', position: 5, prescribedSets: 1, prescribedWeightFirstSet: null, prescribedRepsFirstSet: 8, setPosition: 0, reps: 8, weight: null }]);
    await renderActive();
    await fireEvent.press(screen.getByText('Dips'));
    await fireEvent(screen.getByLabelText('Dips, set 1 reps'), 'valueChange', 10);
    await fireEvent.changeText(screen.getByLabelText('Dips, set 1 weight in kilograms'), '-15,5');
    await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
    expect(db.saveCompletedSet).toHaveBeenCalledWith(expect.anything(), 4, exercise, 6, 0, 10, -15.5, false);
    await fireEvent(screen.getByLabelText('Dips, set 2 reps'), 'valueChange', 6);
    await fireEvent.changeText(screen.getByLabelText('Dips, set 2 weight in kilograms'), '-15');
    await fireEvent.press(screen.getByLabelText('Complete Dips, set 2'));
    expect(db.saveCompletedSet).toHaveBeenLastCalledWith(expect.anything(), 4, exercise, 6, 1, 6, -15, false);
  });

  test('invalid set inputs do not call the save function', async () => {
    await renderActive();
    await fireEvent.press(screen.getByText('Dips'));
    await fireEvent.changeText(screen.getByLabelText('Dips, set 1 weight in kilograms'), '');
    await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
    expect(alert).toHaveBeenLastCalledWith('Set incomplete', expect.any(String));
    expect(db.saveCompletedSet).not.toHaveBeenCalled();
  });

  test('deleted day resumes saved sets and can finish without a live plan', async () => {
    db.getLoggedSession.mockResolvedValue({ trainingDayId: null, trainingDayName: 'Old day', finishTime: null });
    db.listSavedSessionSets.mockResolvedValue([{ loggedExerciseId: 1, exerciseId: null, name: 'Deleted', position: 1, prescribedSets: 1, prescribedWeightFirstSet: null, prescribedRepsFirstSet: 8, setPosition: 0, reps: 8, weight: 0 }]);
    await render(<ActiveSessionScreen {...props<Parameters<typeof ActiveSessionScreen>[0]>('ActiveSession', { sessionId: 4 })} />);
    await screen.findByText('Old day');
    expect(screen.getByText(/original training day has been deleted/)).toBeTruthy();
    expect(db.listExercisesInTrainingDay).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Finish workout'));
    await chooseAlert('Finish');
    expect(screen.getByText('1 exercises · 1 completed sets')).toBeTruthy();
  });

  test('routine library write/delete failures leave the draft usable', async () => {
    db.insertExercise.mockRejectedValueOnce(new Error('failed'));
    db.deleteExercise.mockRejectedValueOnce(new Error('failed'));
    db.deleteRoutine.mockRejectedValueOnce(new Error('failed'));
    await render(<RoutineScreen />);
    await screen.findByText('Routine');
    expect(screen.queryByLabelText('Delete Routine')).toBeNull();
    await fireEvent.press(screen.getByLabelText('View Routine'));
    await waitFor(() => expect(screen.getByText('Edit routine')).not.toBeDisabled());
    await fireEvent.press(screen.getByText('Edit routine'));
    await fireEvent.press(screen.getByLabelText('Delete Routine'));
    await chooseAlert('Delete');
    expect(alert).toHaveBeenLastCalledWith('Delete failed', expect.any(String));
    await fireEvent.press(screen.getByText('Cancel changes'));
    await fireEvent.press(screen.getByText('Add routine'));
    await fireEvent.press(screen.getByText('Add training day'));
    await fireEvent.changeText(screen.getByPlaceholderText('New exercise name'), 'New exercise');
    await fireEvent.press(screen.getByText('Add exercise to library'));
    expect(alert).toHaveBeenLastCalledWith('Save failed', expect.any(String));
    await fireEvent.press(screen.getByLabelText('Delete Dips from library'));
    await chooseAlert('Delete');
    expect(alert).toHaveBeenLastCalledWith('Delete failed', expect.any(String));
    expect(screen.getByText('Dips')).toBeTruthy();
  });
});

// Lower priority than persistence tests: repeated per-screen checks of late error feedback.
test.each(['library', 'history', 'settings', 'session', 'active', 'routine'] as const)(
  '%s suppresses user-facing load errors after leaving the screen', async target => {
    const pending = deferred<Awaited<ReturnType<typeof database.initializeDatabase>>>();
    db.initializeDatabase.mockReturnValueOnce(pending.promise);
    const components = {
      library: <ExerciseLibraryScreen />, history: <WorkoutHistoryScreen />, settings: <SettingsScreen />,
      session: <SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />,
      active: <ActiveSessionScreen {...props<Parameters<typeof ActiveSessionScreen>[0]>('ActiveSession', { sessionId: 4 })} />,
      routine: <RoutineScreen />,
    };
    const result = await render(components[target]);
    await result.unmount();
    await act(async () => pending.reject(new Error('late load failure')));
    expect(alert).not.toHaveBeenCalled();
  }
);

test('canceling an existing routine draft preserves the saved routine', async () => {
  await render(<RoutineScreen />);
  await screen.findByText('Routine');
  await fireEvent.press(screen.getByText('View'));
  await waitFor(() => expect(screen.getByText('Edit routine')).not.toBeDisabled());
  await fireEvent.press(screen.getByText('Edit routine'));
  await fireEvent.changeText(screen.getByPlaceholderText('Routine name'), 'Discard this');
  await fireEvent.press(screen.getByText('Cancel changes'));
  expect(screen.getByText('Routine')).toBeTruthy();
  expect(db.updateRoutine).not.toHaveBeenCalled();
});

test('library deletion also updates an existing day draft', async () => {
  await render(<RoutineScreen />);
  await screen.findByText('Routine');
  await fireEvent.press(screen.getByText('View'));
  await waitFor(() => expect(screen.getByText('Edit routine')).not.toBeDisabled());
  await fireEvent.press(screen.getByText('Edit routine'));
  await fireEvent.press(screen.getByText('Edit day'));
  await fireEvent.press(screen.getByLabelText('Delete Dips from library'));
  await chooseAlert('Delete');
  await fireEvent.press(screen.getByText('Cancel day'));
  expect(screen.getByText('1. Day (0 exercises)')).toBeTruthy();
});


test('holding a library card opens progress for that exercise', async () => {
  db.listExercisesWithRecords.mockResolvedValue([{ id: 7, name: 'Dips', heaviestWeight: -10, repsAtHeaviestWeight: 8 }]);
  await render(<ExerciseLibraryScreen />);
  const card = await screen.findByRole('button', { name: 'View progress for Dips' });
  await fireEvent(card, 'longPress');
  expect(navigation.navigate).toHaveBeenCalledWith('Progress', { exerciseId: 7, exerciseName: 'Dips' });
  await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(navigation.navigate).toHaveBeenCalledTimes(2);
});


test('selecting a calendar session puts its log card first below the calendar without duplication', async () => {
  const base = { routineId: 1, routineName: 'Routine', trainingDayNumber: 1, trainingDayName: 'Day' };
  db.listFinishedWorkouts.mockResolvedValue([
    { ...base, id: 1, finishTime: '2026-11-23T12:00:00Z', sets: [{ id: 1, exerciseName: 'Squat', setPosition: 0, weight: 80, reps: 8 }] },
    { ...base, id: 2, finishTime: '2026-11-22T12:00:00Z', sets: [{ id: 2, exerciseName: 'Dips', setPosition: 0, weight: -20, reps: 6 }] },
  ]);
  await render(<WorkoutHistoryScreen />);
  await screen.findByTestId('workout-card-1');
  const cardIds = () => screen.getAllByTestId(/^workout-card-/).map(card => card.props.testID);
  expect(cardIds()).toEqual(['workout-card-1', 'workout-card-2']);
  await fireEvent.press(screen.getByRole('button', { name: 'View Day on 22/11/2026' }));
  expect(cardIds()).toEqual(['workout-card-2', 'workout-card-1']);
  expect(screen.getAllByText('Dips')).toHaveLength(1);
  expect(db.listFinishedWorkouts).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'View Day on 23/11/2026' }));
  expect(cardIds()).toEqual(['workout-card-1', 'workout-card-2']);
});

test('celebrates a personal record after a successful set save', async () => {
  jest.useFakeTimers();
  try {
    db.saveCompletedSet.mockResolvedValueOnce({ id: 10, isPersonalRecord: true, prescribedReps: 9 });
    await renderActive();
    expect(screen.queryByText('New personal record!')).toBeNull();
    await fireEvent.press(screen.getByText('Dips'));
    await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
    expect(screen.getByText('New personal record!')).toBeOnTheScreen();
    expect(screen.getByText('-20 kg 9 reps')).toBeOnTheScreen();
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).not.toBeDisabled();
    await screen.unmount();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

test('opening a workout blocks repeat starts and resume until creation finishes', async () => {
  const opening = deferred<number>();
  db.createLoggedSession.mockReturnValueOnce(opening.promise);
  db.getResumableSession.mockResolvedValue({ id: 3, routineName: 'Routine', trainingDayName: 'Day', startTime: new Date().toISOString() });
  await render(<SessionScreen {...props<Parameters<typeof SessionScreen>[0]>('Session')} />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Day' }));
  const pressing = fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  await waitFor(() => expect(db.createLoggedSession).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Start workout' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Resume workout' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Resume workout' }));
  expect(db.createLoggedSession).toHaveBeenCalledTimes(1);
  expect(db.getResumableSession).toHaveBeenCalledTimes(1);
  await act(async () => opening.resolve(99));
  await pressing;
  expect(navigation.navigate).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('ActiveSession', { sessionId: 99 });
});


describe('deleting past workouts', () => {
  const first = { id: 1, routineId: 1, trainingDayNumber: 1, trainingDayName: 'Upper', routineName: 'Routine', finishTime: '2026-11-23T12:00:00Z', sets: [] };
  const second = { ...first, id: 2, trainingDayName: 'Lower', finishTime: '2026-11-22T12:00:00Z' };
  test('long press offers cancel and delete, then removes the selected card and calendar entry', async () => {
    db.listFinishedWorkouts.mockResolvedValue([first, second]);
    await render(<WorkoutHistoryScreen />);
    await screen.findByTestId('workout-card-1');
    await fireEvent.press(screen.getByRole('button', { name: 'View Upper on 23/11/2026' }));
    await fireEvent(screen.getByTestId('workout-card-1'), 'longPress');
    expect(alert).toHaveBeenLastCalledWith('Delete workout?', expect.stringContaining('Upper'), expect.any(Array));
    await chooseAlert('Cancel');
    expect(db.deleteFinishedWorkout).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('workout-card-1'), 'longPress');
    await chooseAlert('Delete');
    expect(db.deleteFinishedWorkout).toHaveBeenCalledWith(expect.anything(), 1);
    expect(screen.queryByTestId('workout-card-1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'View Upper on 23/11/2026' })).toBeNull();
    expect(screen.getByTestId('workout-card-2')).toBeVisible();
    await fireEvent(screen.getByTestId('workout-card-2'), 'longPress');
    await chooseAlert('Delete');
    expect(screen.getByText('No finished workouts yet.')).toBeVisible();
  });
  test('a failed delete keeps the card and calendar entry', async () => {
    db.listFinishedWorkouts.mockResolvedValue([first]);
    db.deleteFinishedWorkout.mockRejectedValueOnce(new Error('disk failure'));
    await render(<WorkoutHistoryScreen />);
    await fireEvent(await screen.findByTestId('workout-card-1'), 'longPress');
    await chooseAlert('Delete');
    expect(alert).toHaveBeenLastCalledWith('Delete failed', expect.any(String));
    expect(screen.getByTestId('workout-card-1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'View Upper on 23/11/2026' })).toBeVisible();
  });
});


test('holding a calendar session offers the same deletion confirmation and blocks duplicate deletes', async () => {
  const removal = deferred<void>();
  db.deleteFinishedWorkout.mockReturnValueOnce(removal.promise);
  db.listFinishedWorkouts.mockResolvedValue([{ id: 7, routineId: 1, trainingDayNumber: 1,
    trainingDayName: 'Upper', routineName: 'Routine', finishTime: '2026-11-23T12:00:00Z', sets: [] }]);
  await render(<WorkoutHistoryScreen />);
  const label = await screen.findByRole('button', { name: 'View Upper on 23/11/2026' });
  await fireEvent(label, 'longPress');
  const buttons = alert.mock.calls.at(-1)?.[2];
  const remove = buttons.find((button: { text: string }) => button.text === 'Delete').onPress;
  let pending!: Promise<void>;
  await act(async () => { pending = remove(); });
  expect(db.deleteFinishedWorkout).toHaveBeenCalledTimes(1);
  await act(async () => { await remove(); });
  await fireEvent(label, 'longPress');
  expect(alert).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('workout-card-7')).toBeVisible();
  await act(async () => { removal.resolve(); await pending; });
  expect(screen.getByText('No finished workouts yet.')).toBeVisible();
});


test('extra sets unlock after current sets and collapsed cards cannot complete exercises', async () => {
  db.getExerciseWeightOptions.mockResolvedValue({ weights: [4, 6, 8], increments: [] });
  await renderActive();
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByLabelText('Dips, set 1 weight in kilograms').props.availableWeights).toEqual([4, 6, 8]);
  expect(screen.queryByText('Add set')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByLabelText('Complete Dips')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Complete Dips'));
  expect(screen.queryByText('Set 1: 8 reps × -20 kg')).toBeNull();
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByLabelText('Complete Dips')).not.toBeDisabled();
  await fireEvent(screen.getByLabelText('Dips, set 2 reps'), 'valueChange', 8);
  await fireEvent.changeText(screen.getByLabelText('Dips, set 2 weight in kilograms'), '-15');
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 2'));
  await fireEvent.press(screen.getByLabelText('Add set to Dips'));
  expect(screen.queryByText('Add set')).toBeNull();
  expect(screen.getByLabelText('Dips, set 3 weight in kilograms')).not.toBeDisabled();
  expect(screen.getByLabelText('Dips, set 3 weight in kilograms').props.value).toBe('-15');
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 3'));
  expect(db.saveCompletedSet).toHaveBeenLastCalledWith(expect.anything(), 4, exercise, 0, 2, 8, -15, false);
  expect(screen.getByLabelText('Add set to Dips')).not.toBeDisabled();
});

test('library available weights editor loads and closes', async () => {
  db.listExercisesWithRecords.mockResolvedValue([{ id: 7, name: 'Dips', heaviestWeight: null, repsAtHeaviestWeight: null }]);
  await render(<ExerciseLibraryScreen />);
  await fireEvent.press(await screen.findByLabelText('Weights for Dips'));
  await screen.findByText('Dips: weights');
  await fireEvent.press(screen.getByText('Cancel weights'));
  expect(screen.queryByText('Dips: weights')).toBeNull();
});


test('new exercise can copy configured weights before saving', async () => {
  await render(<RoutineScreen />);
  await screen.findByText('Routine');
  await fireEvent.press(screen.getByText('Add routine'));
  await fireEvent.press(screen.getByText('Add training day'));
  await fireEvent.press(screen.getByText('Configure available weights'));
  db.getExerciseWeightOptions.mockResolvedValue({ weights: [5, 10], increments: [] });
  await fireEvent.press(screen.getByText('Copy weights from another exercise'));
  await fireEvent.press(screen.getByText('Copy from Dips'));
  await fireEvent.changeText(screen.getByPlaceholderText('New exercise name'), 'Rows');
  await fireEvent.press(screen.getByText('Add exercise to library'));
  expect(db.insertExercise).toHaveBeenCalledWith(expect.anything(), 'Rows', [5, 10], []);
});


test('each set starts at the last weight for that position, including added sets', async () => {
  db.listLastSetWeights.mockResolvedValue([
    { exerciseId: 7, setPosition: 0, weight: -25 },
    { exerciseId: 7, setPosition: 1, weight: -15 },
    { exerciseId: 7, setPosition: 2, weight: 0 },
    { exerciseId: 999, setPosition: 0, weight: 100 },
  ]);
  await renderActive();
  expect(db.listLastSetWeights).toHaveBeenCalledWith(expect.anything(), 4);
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByLabelText('Dips, set 1 weight in kilograms').props.value).toBe('-25');
  expect(screen.getByLabelText('Dips, set 2 weight in kilograms').props.value).toBe('-15');
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
  await fireEvent(screen.getByLabelText('Dips, set 2 reps'), 'valueChange', 6);
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 2'));
  await fireEvent.press(screen.getByLabelText('Add set to Dips'));
  expect(screen.getByLabelText('Dips, set 3 weight in kilograms').props.value).toBe('0');
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 3'));
  expect(db.saveCompletedSet).toHaveBeenLastCalledWith(expect.anything(), 4, exercise, 0, 2, 6, 0, false);
});

test('resuming keeps saved weights while prefilling unfinished positions from history', async () => {
  db.listLastSetWeights.mockResolvedValue([
    { exerciseId: 7, setPosition: 0, weight: -25 }, { exerciseId: 7, setPosition: 1, weight: -15 },
  ]);
  db.listSavedSessionSets.mockResolvedValue([{
    loggedExerciseId: 1, exerciseId: 7, name: 'Dips', position: 0,
    prescribedSets: 2, prescribedWeightFirstSet: -20, prescribedRepsFirstSet: 8,
    setPosition: 0, reps: 8, weight: -10,
  }]);
  await renderActive();
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByLabelText('Dips, set 1 weight in kilograms').props.value).toBe('-10');
  expect(screen.getByLabelText('Dips, set 1 weight in kilograms')).toBeDisabled();
  expect(screen.getByLabelText('Dips, set 2 weight in kilograms').props.value).toBe('-15');
});


test('exercise comment saves before logging, displays on the card and summary, and can be edited after completion', async () => {
  await renderActive();
  await fireEvent(screen.getByText('Dips'), 'longPress');
  await chooseAlert('Add comment');
  await fireEvent.changeText(screen.getByLabelText('Exercise comment'), 'Unexpected shoulder pain');
  await fireEvent.press(screen.getByText('Save comment'));
  expect(db.saveExerciseAnnotation).toHaveBeenCalledWith(expect.anything(), 4, exercise, { comment: 'Unexpected shoulder pain', excludeAll: false, excludedPositions: [] });
  expect(db.saveCompletedSet).not.toHaveBeenCalled();
  expect(screen.getByText('Unexpected shoulder pain')).toBeVisible();
  await fireEvent.press(screen.getByText('Dips'));
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
  await fireEvent.press(screen.getByLabelText('Complete Dips'));
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.queryByLabelText('Dips, set 2 weight in kilograms')).toBeNull();
  await fireEvent(screen.getByText('Dips'), 'longPress');
  await chooseAlert('Add comment');
  expect(screen.getByLabelText('Exercise comment').props.value).toBe('Unexpected shoulder pain');
  await fireEvent.press(screen.getByText('Cancel exercise details'));
  await fireEvent.press(screen.getByText('Finish workout'));
  await chooseAlert('Finish');
  expect(screen.getAllByText('Unexpected shoulder pain').length).toBeGreaterThan(0);
});

test('selective and all-set tracking choices save and show on completed cards', async () => {
  await renderActive();
  await fireEvent(screen.getByText('Dips'), 'longPress');
  await chooseAlert('Exclude sets from tracking');
  await fireEvent(screen.getByLabelText('Exclude set 1'), 'valueChange', true);
  await fireEvent.press(screen.getByText('Save tracking choices'));
  expect(db.saveExerciseAnnotation).toHaveBeenLastCalledWith(expect.anything(), 4, exercise, { comment: '', excludeAll: false, excludedPositions: [0] });
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByText('Set 1 — Excluded from PRs and plots')).toBeVisible();
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
  await fireEvent(screen.getByText('Dips'), 'longPress');
  await chooseAlert('Exclude sets from tracking');
  expect(screen.queryByText('Skip exercise')).toBeNull();
  await fireEvent(screen.getByLabelText('Exclude all sets'), 'valueChange', true);
  await fireEvent.press(screen.getByText('Save tracking choices'));
  expect(screen.getByText('All sets excluded from PRs and plots')).toBeVisible();
  await fireEvent.press(screen.getByLabelText('Complete Dips'));
  expect(screen.getByText('Set 1: 8 reps × -20 kg — Excluded from PRs and plots')).toBeVisible();
  await fireEvent.press(screen.getByText('Finish workout'));
  await chooseAlert('Finish');
  expect(screen.getAllByText('Set 1: 8 reps × -20 kg — Excluded from PRs and plots').length).toBeGreaterThan(0);
});

test('annotations restore for exercises without saved sets, including removed plan exercises', async () => {
  db.listExerciseAnnotations.mockResolvedValue([
    { ...exercise, id: 8, exerciseId: 8, loggedExerciseId: 2, name: 'Removed plan exercise', comment: 'Sore elbow', excludeAll: true, excludedPositions: [] },
    { ...exercise, id: -3, exerciseId: null, loggedExerciseId: 3, name: 'Deleted note exercise', comment: 'Old note', excludeAll: false, excludedPositions: [1] },
    { ...exercise, exerciseId: 7, loggedExerciseId: 4, comment: 'Kept note', excludeAll: false, excludedPositions: [1] },
  ]);
  await renderActive();
  expect(screen.getByText('Sore elbow')).toBeVisible();
  expect(screen.getByText('Old note')).toBeVisible();
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByText('Set 2 — Locked — Excluded from PRs and plots')).toBeVisible();
});

test('history displays exercise comments and excluded sets', async () => {
  db.listFinishedWorkouts.mockResolvedValue([{
    id: 1, routineId: 1, routineName: 'Routine', trainingDayNumber: 1, trainingDayName: 'Day', finishTime: '2026-10-01T12:00:00Z', exerciseNotes: [{ exerciseName: 'Skipped', comment: 'Stopped due to pain' }], sets: [
      { id: 1, exerciseName: 'Dips', exerciseComment: 'Sore shoulder', excludedFromTracking: true, setPosition: 0, reps: 8, weight: -20 },
      { id: 2, exerciseName: 'Dips', exerciseComment: 'Sore shoulder', setPosition: 1, reps: 6, weight: -20 },
      { id: 3, exerciseName: 'Rows', exerciseComment: 'Sore elbow', setPosition: 0, reps: 6, weight: 20 },
    ],
  }]);
  await render(<WorkoutHistoryScreen />);
  expect(await screen.findByText('Sore shoulder')).toBeVisible();
  expect(screen.getAllByText('Sore shoulder')).toHaveLength(1);
  expect(screen.getByText('Sore elbow')).toBeVisible();
  expect(screen.getByText('Stopped due to pain')).toBeVisible();
  expect(screen.getByText('Set 1 — Excluded from PRs and plots')).toBeVisible();
});


test('last rep defaults follow weight and set position while remaining adjustable', async () => {
  db.listLastSetWeights.mockResolvedValue([
    { exerciseId: 7, setPosition: 0, weight: -20 }, { exerciseId: 7, setPosition: 1, weight: -15 }, { exerciseId: 7, setPosition: 2, weight: 0 },
  ]);
  db.listLastSetReps.mockResolvedValue([
    { exerciseId: 7, setPosition: 0, weight: -20, reps: 99 },
    { exerciseId: 7, setPosition: 1, weight: -15, reps: 6 },
    { exerciseId: 7, setPosition: 1, weight: -10, reps: 4 },
    { exerciseId: 7, setPosition: 2, weight: 0, reps: 45 },
  ]);
  await renderActive();
  await fireEvent.press(screen.getByText('Dips'));
  expect(screen.getByLabelText('Dips, set 1 reps').props.value).toBe(8);
  expect(screen.getByLabelText('Dips, set 2 reps').props.value).toBe(6);
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
  await fireEvent.changeText(screen.getByLabelText('Dips, set 2 weight in kilograms'), '-10');
  expect(screen.getByLabelText('Dips, set 2 reps').props.value).toBe(4);
  await fireEvent(screen.getByLabelText('Dips, set 2 reps'), 'valueChange', 5);
  await fireEvent.changeText(screen.getByLabelText('Dips, set 2 weight in kilograms'), '-10');
  expect(screen.getByLabelText('Dips, set 2 reps').props.value).toBe(5);
  await fireEvent.changeText(screen.getByLabelText('Dips, set 2 weight in kilograms'), '-15');
  expect(screen.getByLabelText('Dips, set 2 reps').props.value).toBe(6);
  await fireEvent.press(screen.getByLabelText('Complete Dips, set 2'));
  await fireEvent.press(screen.getByLabelText('Add set to Dips'));
  expect(screen.getByLabelText('Dips, set 3 reps').props.value).toBe(45);
  expect(screen.getByLabelText('Dips, set 3 reps').props.maximumValue).toBeGreaterThanOrEqual(45);
});

test('progression mode can be selected in settings', async () => {
  await render(<SettingsScreen />);
  const fixed = await screen.findByRole('radio', { name: 'Fixed targets' });
  expect(screen.getByRole('radio', { name: 'Hypertrophy (+1 rep)' })).toBeChecked();
  await fireEvent.press(fixed);
  expect(db.setProgressionMode).toHaveBeenCalledWith(expect.anything(), 'fixed');
  expect(fixed).toBeChecked();
});

test('routine management pins active routines and edits prescriptions from compact table rows', async () => {
  db.listRoutines.mockResolvedValue([{ id: 1, name: 'Routine' }, { id: 2, name: 'Older' }]);
  db.getActiveRoutineId.mockResolvedValue(2);
  await render(<RoutineScreen />);
  await screen.findByText('Active routine');
  expect(screen.getAllByText(/^(Routine|Older)$/).map(node => node.props.children)).toEqual(['Older', 'Routine']);
  expect(screen.getByText('Inactive routines')).toBeVisible();
  await fireEvent.press(screen.getByLabelText('Activate Routine'));
  expect(db.setActiveRoutine).toHaveBeenCalledWith(expect.anything(), 1);
  await fireEvent.press(screen.getByLabelText('View Routine'));
  const row = await screen.findByLabelText('Edit Day: Dips prescription');
  await fireEvent.press(row);
  await fireEvent.changeText(screen.getByLabelText('Prescribed first-set reps'), '12');
  await fireEvent.press(screen.getByText('Save prescription'));
  expect(db.updateExercisePrescription).toHaveBeenCalledWith(expect.anything(), 2, { ...exercise, prescribedRepsFirstSet: 12 });
  expect(screen.getByLabelText('Edit Day: Dips prescription')).toBeVisible();
});

test('routine management copies routines into drafts and searches reusable training days', async () => {
  db.listReusableTrainingDays.mockResolvedValue([
    { id: 2, name: 'Leg day', position: 0, routineId: 1, routineName: 'Old plan' },
    { id: 3, name: 'Upper day', position: 1, routineId: 1, routineName: 'Old plan' },
  ]);
  await render(<RoutineScreen />);
  await fireEvent.press(await screen.findByLabelText('Copy Routine'));
  expect(screen.getByPlaceholderText('Routine name').props.value).toBe('Routine (copy)');
  expect(screen.getByText('1. Day (1 exercises)')).toBeVisible();
  await fireEvent.press(screen.getByText('Load existing training day'));
  await fireEvent.changeText(screen.getByLabelText('Search training days'), 'LEG');
  expect(screen.queryByLabelText('Load Upper day from Old plan')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Load Leg day from Old plan'));
  expect(screen.getByPlaceholderText('Training day name').props.value).toBe('Leg day');
  await fireEvent.press(screen.getByText('Add day to routine draft'));
  await fireEvent.press(screen.getByText('Save routine'));
  const drafts = db.insertRoutine.mock.calls[0][2];
  expect(drafts.map(day => day.name)).toEqual(['Day', 'Leg day']);
  expect(drafts.every(day => day.id === undefined)).toBe(true);
  expect(db.updateRoutine).not.toHaveBeenCalled();
});

test('sortable home tiles and day rows persist their dropped order while tap edits prescriptions', async () => {
  const home = await render(<StartScreen {...props<Parameters<typeof StartScreen>[0]>('Start')} />);
  await waitFor(() => expect(screen.getByTestId('sortable-grid').props.sortEnabled).toBe(true));
  await fireEvent(screen.getByTestId('sortable-grid'), 'dragEnd', { fromIndex: 0, toIndex: 4, data: [...screen.getByTestId('sortable-grid').props.data.slice(1), screen.getByTestId('sortable-grid').props.data[0]] });
  expect(db.setStartScreenOrder).toHaveBeenCalledWith(expect.anything(), ['Routines', 'ExerciseLibrary', 'WorkoutHistory', 'Settings', 'Session']);
  await home.unmount();
  db.listExercisesInTrainingDay.mockResolvedValue([exercise, { ...exercise, id: 8, name: 'Rows' }]);
  await render(<RoutineScreen />);
  await fireEvent.press(await screen.findByLabelText('View Routine'));
  await screen.findByLabelText('Edit Day: Dips prescription');
  const reordered = [{ ...exercise, id: 8, name: 'Rows' }, exercise];
  await fireEvent(screen.getByTestId('sortable-grid'), 'dragEnd', { data: reordered, fromIndex: 0, toIndex: 1 });
  expect(db.reorderTrainingDayExercises).toHaveBeenCalledWith(expect.anything(), 2, [8, 7]);
  await fireEvent.press(screen.getByLabelText('Edit Day: Dips prescription'));
  expect(screen.getByLabelText('Prescribed first-set reps')).toBeVisible();
});

test('imports Legacy from Settings and reports its result', async () => {
  jest.mocked(importLegacy).mockResolvedValue({ added: true, workouts: 278, sets: 5973, exercisesCreated: 60 });
  await render(<SettingsScreen />);
  await screen.findByText('Workout targets');
  await fireEvent.press(screen.getByText('Import Legacy'));
  await waitFor(() => expect(importLegacy).toHaveBeenCalledWith(expect.anything()));
  expect(alert).toHaveBeenCalledWith('Legacy imported', expect.stringContaining('278 workouts and 5973 sets'));
});
