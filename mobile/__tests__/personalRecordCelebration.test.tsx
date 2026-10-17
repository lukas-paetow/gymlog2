import { act, render, screen } from '@testing-library/react-native';
import PersonalRecordCelebration from '../components/PersonalRecordCelebration';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('shows a short celebration for a new record, restarts for another, then disappears', async () => {
  const view = await render(<PersonalRecordCelebration trigger={0} />);
  expect(screen.queryByText('New personal record!')).toBeNull();
  await view.rerender(<PersonalRecordCelebration trigger={1} />);
  expect(screen.getByRole('alert')).toHaveTextContent('New personal record!');
  await act(async () => jest.advanceTimersByTime(800));
  await view.rerender(<PersonalRecordCelebration trigger={2} />);
  await act(async () => jest.advanceTimersByTime(800));
  expect(screen.getByText('New personal record!')).toBeOnTheScreen();
  await act(async () => jest.advanceTimersByTime(1000));
  expect(screen.queryByText('New personal record!')).toBeNull();
});

test('resetting the trigger dismisses an active celebration', async () => {
  const view = await render(<PersonalRecordCelebration trigger={1} />);
  expect(screen.getByText('New personal record!')).toBeOnTheScreen();
  await view.rerender(<PersonalRecordCelebration trigger={0} />);
  await act(async () => jest.runAllTimers());
  expect(screen.queryByText('New personal record!')).toBeNull();
  await view.unmount();
});
