import { fireEvent, render, screen } from '@testing-library/react-native';
import WorkoutCalendar from '../components/WorkoutCalendar';
import { localDateKey, monthCells, routineKey } from '../workoutCalendar';
import type { FinishedWorkout } from '../database';

const onSelectWorkout = jest.fn();
beforeEach(() => jest.clearAllMocks());

const workout = (id: number, overrides: Partial<FinishedWorkout> = {}): FinishedWorkout => ({
  id, routineId: 1, routineName: 'Strength', trainingDayNumber: 1, trainingDayName: 'Upper',
  finishTime: '2026-12-10T12:00:00Z', sets: [], ...overrides,
});

test('calendar grids start on Monday, include leap day, and fill complete weeks', () => {
  const february = monthCells(2024, 1);
  expect(february).toHaveLength(35);
  expect(february.slice(0, 3)).toEqual([null, null, null]);
  expect(february[3]?.getDate()).toBe(1);
  expect(february.filter(Boolean)).toHaveLength(29);
  expect(monthCells(2026, 10)).toHaveLength(42);
  expect(monthCells(2026, 10)[0]).toBeNull();
});

test('routine identity survives renaming and local dates follow the phone timezone', () => {
  expect(routineKey(workout(1))).toBe(routineKey(workout(2, { routineName: 'Renamed' })));
  expect(routineKey(workout(1, { routineId: null }))).toBe('deleted:Strength');
  expect(localDateKey(new Date('2026-12-10T23:30:00Z'))).toBe('2026-12-11');
});

test('shows saved day names, multiple sessions per date, and a routine selector', async () => {
  await render(<WorkoutCalendar onSelectWorkout={onSelectWorkout} dateFormat="DD/MM/YYYY" workouts={[
    workout(1), workout(2, { trainingDayNumber: 2, trainingDayName: 'Lower' }),
    workout(3, { routineId: 2, routineName: 'Other', trainingDayNumber: 3, trainingDayName: 'Full body' }),
  ]} />);
  expect(screen.getByLabelText('10/12/2026, Upper, Lower')).toBeVisible();
  expect(screen.getByText('Upper')).toBeVisible();
  expect(screen.getByText('Lower')).toBeVisible();
  expect(screen.queryByText('Full body')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Calendar routine: Other' }));
  expect(screen.getByLabelText('10/12/2026, Full body')).toBeVisible();
  expect(screen.queryByText('Upper')).toBeNull();
});

test('month controls cross year boundaries and preserve deleted-day history', async () => {
  await render(<WorkoutCalendar onSelectWorkout={onSelectWorkout} dateFormat="DD/MM/YYYY" workouts={[
    workout(1, { routineId: null, trainingDayNumber: null }),
  ]} />);
  expect(screen.getByLabelText('10/12/2026, Upper')).toBeVisible();
  expect(screen.getByText('Upper')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  expect(screen.getByLabelText('01/01/2027')).toBeVisible();
  expect(screen.queryByLabelText('10/12/2026, Upper')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByLabelText('10/12/2026, Upper')).toBeVisible();
});

test('falls back to a remaining routine if the selected routine disappears on reload', async () => {
  const first = workout(1);
  const second = workout(2, { routineId: 2, routineName: 'Other' });
  const view = await render(<WorkoutCalendar onSelectWorkout={onSelectWorkout} workouts={[first, second]} dateFormat="DD/MM/YYYY" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Calendar routine: Other' }));
  await view.rerender(<WorkoutCalendar onSelectWorkout={onSelectWorkout} workouts={[first]} dateFormat="DD/MM/YYYY" />);
  expect(screen.getByRole('button', { name: 'Calendar routine: Strength' })).toBeDisabled();
  expect(screen.getByLabelText('10/12/2026, Upper')).toBeVisible();
});


test('identical session labels select their own session IDs and expose selection state', async () => {
  await render(<WorkoutCalendar onSelectWorkout={onSelectWorkout} workouts={[workout(1), workout(2)]}
    selectedWorkoutId={2} dateFormat="DD/MM/YYYY" />);
  const buttons = screen.getAllByRole('button', { name: 'View Upper on 10/12/2026' });
  await fireEvent.press(buttons[1]);
  expect(onSelectWorkout).toHaveBeenCalledWith(2);
  expect(buttons[1].props.accessibilityState.selected).toBe(true);
  expect(buttons[0].props.accessibilityState.selected).toBe(false);
});
