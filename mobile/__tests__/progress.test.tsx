import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ProgressScreen from '../screens/ProgressScreen';
import ExerciseProgressChart from '../components/ExerciseProgressChart';
import * as database from '../database';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('../database', () => ({ initializeDatabase: jest.fn(), listExerciseProgress: jest.fn(), getDateFormat: jest.fn() }));
// Keep our chart adapter real; replace the external native drawing boundary.
jest.mock('react-native-gifted-charts', () => ({
  LineChart: (props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'line-chart' }),
}));
const db = jest.mocked(database);
const props = { route: { params: { exerciseId: 7, exerciseName: 'Dips' } } } as Parameters<typeof ProgressScreen>[0];
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  db.initializeDatabase.mockResolvedValue({} as Awaited<ReturnType<typeof database.initializeDatabase>>);
  db.getDateFormat.mockResolvedValue('DD/MM/YYYY');
  db.listExerciseProgress.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

test('selects heaviest weight initially and switches to assistance, keeping best-rep dates', async () => {
  db.listExerciseProgress.mockResolvedValue([
    { id: 1, setPosition: 0, sessionId: 1, finishTime: '2026-10-01T12:00:00Z', weight: -20, reps: 8 },
    { id: 2, setPosition: 1, sessionId: 2, finishTime: '2026-10-03T12:00:00Z', weight: 0, reps: 4 },
  ]);
  await render(<ProgressScreen {...props} />);
  expect(await screen.findByText('03/10/2026: Set 2 · 4 reps')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Show volume' })).toBeDisabled();
  expect(screen.getByText('Volume is unavailable for assisted exercises without body weight.')).toBeVisible();
  expect(db.listExerciseProgress).toHaveBeenCalledWith(expect.anything(), 7);
  await fireEvent(screen.getByTestId('progress-chart'), 'layout', { nativeEvent: { layout: { width: 400 } } });
  expect(screen.getByTestId('line-chart').props.data.map((point: { value: number }) => point.value)).toEqual([4]);
  const initialX = screen.getByTestId('line-chart').props.data[0].x;
  await fireEvent.press(screen.getByRole('button', { name: 'Select -20 kg' }));
  // Weight changes keep the scale while updating the observations.
  expect(screen.getByTestId('line-chart').props.maxValue).toBe(10);
  expect(screen.getByTestId('line-chart').props.data.map((point: { value: number }) => point.value)).toEqual([8]);
  expect(screen.getByTestId('line-chart').props.data[0].x).toBeLessThan(initialX);
  expect(screen.getByText('01/10/2026: Set 1 · 8 reps')).toBeVisible();
  expect(screen.queryByText('03/10/2026: Set 2 · 4 reps')).toBeNull();
});

test('shows empty history and a load failure', async () => {
  const result = await render(<ProgressScreen {...props} />);
  expect(await screen.findByText('No finished workouts with a recorded weight yet.')).toBeVisible();
  await result.unmount();
  db.listExerciseProgress.mockRejectedValue(new Error('offline'));
  await render(<ProgressScreen {...props} />);
  expect(await screen.findByText('Could not load exercise progress.')).toBeVisible();
});

test('does not update after leaving during a query', async () => {
  let resolve!: (rows: database.ExerciseProgressPoint[]) => void;
  db.listExerciseProgress.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = await render(<ProgressScreen {...props} />);
  expect(screen.getByText('Loading progress…')).toBeVisible();
  await view.unmount();
  await act(async () => resolve([]));
});

test('chart fits its measured width and positions observations on the calendar axis', async () => {
  const points = [
    { timestamp: new Date('2026-10-01T12:00:00').getTime(), label: '01/10', value: 8 },
    { timestamp: new Date('2026-10-02T12:00:00').getTime(), label: '02/10', value: 9 },
    { timestamp: new Date('2026-10-05T12:00:00').getTime(), label: '05/10', value: 11 },
  ];
  const view = await render(<ExerciseProgressChart points={points} />);
  await fireEvent(screen.getByTestId('progress-chart'), 'layout', { nativeEvent: { layout: { width: 400 } } });
  const chart = screen.getByTestId('line-chart');
  const xs = chart.props.data.map((point: { x: number }) => point.x);
  expect((xs[2] - xs[1]) / (xs[1] - xs[0])).toBeCloseTo(3);
  expect(chart.props.width + chart.props.yAxisLabelWidth + chart.props.yAxisThickness + chart.props.dataPointsRadius).toBe(400);
  expect(xs[2]).toBeLessThan(chart.props.width);
  expect(chart.props.maxValue).toBe(15);
  expect(chart.props.endSpacing).toBeGreaterThan(chart.props.dataPointsRadius);
  expect(screen.queryByText('01/10')).toBeNull();
  await view.rerender(<ExerciseProgressChart points={[points[0]]} />);
  expect(screen.getByTestId('line-chart').props.data[0].x).toBeCloseTo(180);
});


test('an exact tick maximum still leaves headroom above the dot', async () => {
  await render(<ExerciseProgressChart points={[{ timestamp: 0, label: 'Date', value: 10 }]} />);
  await fireEvent(screen.getByTestId('progress-chart'), 'layout', { nativeEvent: { layout: { width: 400 } } });
  expect(screen.getByTestId('line-chart').props.maxValue).toBe(15);
});


test('all sets retain their set numbers and colors; top mode chooses before filtering by weight', async () => {
  db.listExerciseProgress.mockResolvedValue([
    { id: 1, sessionId: 1, setPosition: 0, finishTime: '2026-10-01T12:00:00Z', weight: 60, reps: 8 },
    { id: 2, sessionId: 1, setPosition: 1, finishTime: '2026-10-01T12:00:00Z', weight: 70, reps: 5 },
    { id: 3, sessionId: 2, setPosition: 0, finishTime: '2026-10-03T12:00:00Z', weight: 60, reps: 10 },
    { id: 4, sessionId: 2, setPosition: 1, finishTime: '2026-10-03T12:00:00Z', weight: 60, reps: 7 },
    { id: 5, sessionId: 2, setPosition: 2, finishTime: '2026-10-03T12:00:00Z', weight: 50, reps: 12 },
  ]);
  await render(<ProgressScreen {...props} />);
  await screen.findByText('All completed sets at this weight.');
  await fireEvent.press(screen.getByRole('button', { name: 'Select 60 kg' }));
  await fireEvent(screen.getByTestId('progress-chart'), 'layout', { nativeEvent: { layout: { width: 400 } } });
  const data = screen.getByTestId('line-chart').props.data;
  expect(data.map((set: { value: number }) => set.value)).toEqual([8, 10, 7]);
  expect(data[0].dataPointColor).toBe(data[1].dataPointColor);
  expect(data[2].dataPointColor).not.toBe(data[1].dataPointColor);
  expect(screen.getByText('Set 1')).toBeVisible();
  expect(screen.getByText('Set 2')).toBeVisible();
  expect(screen.getByTestId('line-chart').props.thickness).toBe(0);
  await fireEvent.press(screen.getByRole('button', { name: 'Show top sets only' }));
  expect(screen.getByTestId('line-chart').props.data.map((set: { value: number }) => set.value)).toEqual([10]);
  expect(screen.queryByText('Set 2')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Select 50 kg' }));
  expect(screen.getByText('No top sets at this weight.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Show all sets' }));
  expect(screen.getByText('03/10/2026: Set 3 · 12 reps')).toBeVisible();
});

test('volume combines weights per workout and top-only mode uses the heaviest set', async () => {
  db.listExerciseProgress.mockResolvedValue([
    { id: 1, sessionId: 1, setPosition: 0, finishTime: '2026-10-01T12:00:00Z', weight: 60, reps: 10 },
    { id: 2, sessionId: 1, setPosition: 1, finishTime: '2026-10-01T12:00:00Z', weight: 80, reps: 5 },
    { id: 3, sessionId: 2, setPosition: 0, finishTime: '2026-10-03T12:00:00Z', weight: 50, reps: 8 },
    { id: 4, sessionId: 2, setPosition: 1, finishTime: '2026-10-03T12:00:00Z', weight: 50, reps: 6 },
  ]);
  await render(<ProgressScreen {...props} />);
  await screen.findByRole('button', { name: 'Select 60 kg' });
  await fireEvent.press(screen.getByRole('button', { name: 'Select 60 kg' }));
  await fireEvent(screen.getByTestId('progress-chart'), 'layout', { nativeEvent: { layout: { width: 400 } } });
  await fireEvent.press(screen.getByRole('button', { name: 'Show volume' }));
  expect(screen.getByText('Volume (kg · reps)')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Select 60 kg' })).toBeNull();
  expect(screen.queryByText('Set 1')).toBeNull();
  expect(screen.getByText('01/10/2026: 1000 kg · reps')).toBeVisible();
  expect(screen.getByTestId('line-chart').props.data.map((set: { value: number }) => set.value)).toEqual([1000, 700]);
  const fullScale = screen.getByTestId('line-chart').props.maxValue;
  expect(fullScale).toBeGreaterThan(1000);
  expect(screen.getByTestId('line-chart').props.yAxisLabelWidth).toBeGreaterThan(36);
  await fireEvent.press(screen.getByRole('button', { name: 'Show top sets only' }));
  expect(screen.getByText('Volume of the heaviest set per workout.')).toBeVisible();
  expect(screen.getByTestId('line-chart').props.data.map((set: { value: number }) => set.value)).toEqual([400, 400]);
  expect(screen.getByTestId('line-chart').props.maxValue).toBe(fullScale);
  await fireEvent.press(screen.getByRole('button', { name: 'Show all sets' }));
  expect(screen.getByTestId('line-chart').props.data.map((set: { value: number }) => set.value)).toEqual([1000, 700]);
  await fireEvent.press(screen.getByRole('button', { name: 'Show reps' }));
  expect(screen.getByText('Reps at selected weight')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Select 60 kg' })).toBeDisabled();
  expect(screen.getByTestId('line-chart').props.data.map((set: { value: number }) => set.value)).toEqual([10]);
});
