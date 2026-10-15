import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ExerciseProgressChart from '../components/ExerciseProgressChart';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

// Keep Gifted Charts and SVG real: verify the dots, not just input props.
test('switching repeated rep patterns moves the rendered dots along a fixed timeline', async () => {
  const day = 24 * 60 * 60 * 1000;
  const start = new Date('2026-10-01T12:00:00').getTime();
  const earlier = [8, 9, 10].map((value, index) => ({ value, timestamp: start + index * day, label: '', color: index === 0 ? '#2563eb' : '#ea580c' }));
  const later = earlier.map(point => ({ ...point, timestamp: point.timestamp + 6 * day }));
  const domain = { start, end: start + 8 * day, max: 10 };
  const view = await render(<ExerciseProgressChart points={later} domain={domain} />);
  await fireEvent(screen.getByTestId('progress-chart'), 'layout', { nativeEvent: { layout: { width: 400 } } });
  await act(async () => { jest.runAllTimers(); });
  const before = screen.root!.queryAll(node => node.type === 'RNSVGCircle').map(circle => ({ x: circle.props.cx, y: circle.props.cy, fill: circle.props.fill }));
  expect(before).toHaveLength(3);
  expect(before[0].fill).not.toEqual(before[1].fill);
  expect(before[1].fill).toEqual(before[2].fill);
  await view.rerender(<ExerciseProgressChart points={earlier} domain={domain} />);
  await act(async () => { jest.runAllTimers(); });
  const after = screen.root!.queryAll(node => node.type === 'RNSVGCircle').map(circle => ({ x: circle.props.cx, y: circle.props.cy, fill: circle.props.fill }));
  expect(after).toHaveLength(3);
  for (let index = 0; index < 3; index++) {
    expect(after[index].x).toBeLessThan(before[index].x);
    expect(after[index].y).toBe(before[index].y);
    expect(after[index].y).toBeGreaterThan(3);
  }
});
