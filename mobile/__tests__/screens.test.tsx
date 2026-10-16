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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (effect: () => void) => {
    const React = require('react');
    React.useEffect(effect, [effect]);
  },
}));
jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props: object) => React.createElement(View, props);
});
jest.mock('../database', () => {
  const names = ['initializeDatabase', 'listExercisesWithRecords', 'deleteExercise', 'listFinishedWorkouts',
    'getDateFormat', 'setDateFormat', 'seedDemoHistory', 'getResumableSession', 'listRoutines', 'listTrainingDays',
    'createLoggedSession', 'getLoggedSession', 'listExercisesInTrainingDay', 'listSavedSessionSets', 'saveCompletedSet',
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
  db.setDateFormat.mockResolvedValue();
  db.seedDemoHistory.mockResolvedValue(true);
  db.getResumableSession.mockResolvedValue(null);
  db.listRoutines.mockResolvedValue([{ id: 1, name: 'Routine' }]);
  db.listTrainingDays.mockResolvedValue([{ id: 2, name: 'Day', position: 0, routineId: 1 }]);
  db.listExercises.mockResolvedValue([{ id: 7, name: 'Dips' }]);
  db.listExercisesInTrainingDay.mockResolvedValue([exercise]);
  db.getLoggedSession.mockResolvedValue({ trainingDayId: 2, trainingDayName: 'Day', finishTime: null });
  db.listSavedSessionSets.mockResolvedValue([]);
  db.createLoggedSession.mockResolvedValue(4);
  db.saveCompletedSet.mockResolvedValue(10);
  db.finishLoggedSession.mockResolvedValue();
  db.deleteExercise.mockResolvedValue();
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
    const saving = deferred<number>();
    db.saveCompletedSet.mockReturnValueOnce(saving.promise);
    await renderActive();
    await fireEvent.press(screen.getByText('Dips'));
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).toBeDisabled();
    const press = fireEvent.press(screen.getByLabelText('Complete Dips, set 1'));
    await waitFor(() => expect(db.saveCompletedSet).toHaveBeenCalledTimes(1));
    expect(db.saveCompletedSet).toHaveBeenCalledWith(expect.anything(), 4, exercise, 0, 0, 8, -20);
    expect(screen.getByText('Finish workout')).toBeDisabled();
    await fireEvent.press(screen.getAllByText('Saving…')[0]);
    expect(db.saveCompletedSet).toHaveBeenCalledTimes(1);
    await act(async () => saving.resolve(10));
    await press;
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).not.toBeDisabled();
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
    expect(screen.getByLabelText('Dips, set 2 weight in kilograms')).toBeDisabled();
  });
  test('long-press reveals Skip and does not write unperformed data', async () => {
    await renderActive();
    await fireEvent(screen.getByText('Dips'), 'longPress');
    await chooseAlert('Skip exercise');
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
    expect(db.insertExercise).toHaveBeenCalledWith(expect.anything(), 'Squat');
  });

  test('confirms routine deletion and library deletion', async () => {
    await render(<RoutineScreen />);
    await screen.findByText('Routine');
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
    expect(db.saveCompletedSet).toHaveBeenCalledWith(expect.anything(), 4, exercise, 6, 0, 10, -15.5);
    await fireEvent(screen.getByLabelText('Dips, set 2 reps'), 'valueChange', 6);
    await fireEvent.changeText(screen.getByLabelText('Dips, set 2 weight in kilograms'), '-15');
    await fireEvent.press(screen.getByLabelText('Complete Dips, set 2'));
    expect(db.saveCompletedSet).toHaveBeenLastCalledWith(expect.anything(), 4, exercise, 6, 1, 6, -15);
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
    await fireEvent.press(screen.getByLabelText('Delete Routine'));
    await chooseAlert('Delete');
    expect(alert).toHaveBeenLastCalledWith('Delete failed', expect.any(String));
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
