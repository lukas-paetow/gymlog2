import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import WeightOptionsEditor from '../components/WeightOptionsEditor';
import ExerciseWeightsModal from '../components/ExerciseWeightsModal';
import type { WeightIncrement, WeightOptions } from '../weightOptions';
import * as database from '../database';

jest.mock('../database', () => ({ initializeDatabase: jest.fn(), getExerciseWeightOptions: jest.fn(), setExerciseWeights: jest.fn() }));
const db = jest.mocked(database);
const copy = jest.fn<Promise<WeightOptions>, [number]>();
const close = jest.fn();
function Editor() {
  const [weights, setWeights] = useState<number[]>([]);
  const [increments, setIncrements] = useState<WeightIncrement[]>([]);
  return <><WeightOptionsEditor increments={increments} onIncrementsChange={setIncrements} weights={weights} onChange={setWeights} exercises={[{ id: 2, name: 'Curls' }]} onCopy={copy} /><Text testID="values">{JSON.stringify(weights)}</Text><Text testID="increments">{JSON.stringify(increments)}</Text></>;
}
function Modal() {
  return <ExerciseWeightsModal exercise={{ id: 1, name: 'Rows' }} exercises={[{ id: 1, name: 'Rows' }, { id: 2, name: 'Curls' }]} onClose={close} />;
}
beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  db.initializeDatabase.mockResolvedValue({} as Awaited<ReturnType<typeof database.initializeDatabase>>);
  db.getExerciseWeightOptions.mockResolvedValue({ weights: [4, 10], increments: [{ start: 0, increment: 2.5 }] });
  db.setExerciseWeights.mockResolvedValue();
  copy.mockResolvedValue({ weights: [10, 17.5], increments: [{ start: 4, increment: 1 }] });
});
afterEach(() => jest.restoreAllMocks());

test('increments without an end and custom weights can be added, removed, and cleared', async () => {
  await render(<Editor />);
  await fireEvent.press(screen.getByText('Add weight increment'));
  expect(Alert.alert).toHaveBeenCalledWith('Invalid increment', expect.any(String));
  await fireEvent.changeText(screen.getByLabelText('Starting weight'), '4');
  expect(screen.queryByLabelText('Range end')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Weight increment'), '1');
  await fireEvent.press(screen.getByText('Add weight increment'));
  expect(screen.getByTestId('increments')).toHaveTextContent('[{"start":4,"increment":1}]');
  await fireEvent.changeText(screen.getByLabelText('Custom weight'), '17,5');
  await fireEvent.press(screen.getByText('Add custom weight'));
  expect(screen.getByTestId('values')).toHaveTextContent('[17.5]');
  await fireEvent.press(screen.getByLabelText('Remove 17.5 kg'));
  expect(screen.getByTestId('values')).toHaveTextContent('[]');
  await fireEvent.press(screen.getByLabelText('Remove increment from 4 kg'));
  expect(screen.getByTestId('increments')).toHaveTextContent('[]');
  await fireEvent.press(screen.getByText('Add weight increment'));
  await fireEvent.press(screen.getByText('Clear weights'));
  expect(screen.getByTestId('values')).toHaveTextContent('[]');
  await fireEvent.press(screen.getByText('Add custom weight'));
  expect(Alert.alert).toHaveBeenCalledWith('Invalid weight', expect.any(String));
});
test('copy replaces weights and preserves the list if loading fails', async () => {
  await render(<Editor />);
  await fireEvent.press(screen.getByText('Copy weights from another exercise'));
  await fireEvent.press(screen.getByText('Copy from Curls'));
  expect(copy).toHaveBeenCalledWith(2);
  expect(screen.getByTestId('values')).toHaveTextContent('[10,17.5]');
  copy.mockRejectedValueOnce(new Error('failed'));
  await fireEvent.press(screen.getByText('Copy weights from another exercise'));
  await fireEvent.press(screen.getByText('Copy from Curls'));
  expect(Alert.alert).toHaveBeenCalledWith('Copy failed', expect.any(String));
  expect(screen.getByTestId('values')).toHaveTextContent('[10,17.5]');
});
test('empty copy list and disabled editor', async () => {
  const view = await render(<WeightOptionsEditor increments={[]} onIncrementsChange={jest.fn()} weights={[]} onChange={jest.fn()} exercises={[]} onCopy={copy} />);
  await fireEvent.press(screen.getByText('Copy weights from another exercise'));
  expect(screen.getByText('No other exercises to copy from.')).toBeVisible();
  await view.rerender(<WeightOptionsEditor increments={[]} onIncrementsChange={jest.fn()} weights={[]} onChange={jest.fn()} exercises={[]} onCopy={copy} disabled />);
  expect(screen.getByText('Add weight increment')).toBeDisabled();
});
test('modal loads, copies from another exercise, and saves', async () => {
  await render(<Modal />);
  await screen.findByText('4 · 10 kg');
  await fireEvent.press(screen.getByText('Copy weights from another exercise'));
  expect(screen.queryByText('Copy from Rows')).toBeNull();
  await fireEvent.press(screen.getByText('Copy from Curls'));
  expect(db.getExerciseWeightOptions).toHaveBeenLastCalledWith(expect.anything(), 2);
  await fireEvent.press(screen.getByText('Save available weights'));
  expect(db.setExerciseWeights).toHaveBeenCalledWith(expect.anything(), 1, [4, 10], [{ start: 0, increment: 2.5 }]);
  expect(close).toHaveBeenCalledTimes(1);
});
test('save errors keep editor open and cancellation closes it', async () => {
  db.setExerciseWeights.mockRejectedValueOnce(new Error('failed'));
  await render(<Modal />);
  await screen.findByText('4 · 10 kg');
  await fireEvent.press(screen.getByText('Save available weights'));
  expect(Alert.alert).toHaveBeenCalledWith('Save failed', expect.any(String));
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Cancel weights'));
  expect(close).toHaveBeenCalled();
});
test('failed loading prevents saving', async () => {
  db.getExerciseWeightOptions.mockRejectedValueOnce(new Error('failed'));
  await render(<Modal />);
  await screen.findByText('Could not load available weights.');
  expect(screen.getByText('Save available weights')).toBeDisabled();
});
test.each([false, true])('unmount ignores pending load (reject: %s)', async fail => {
  let resolve!: (weights: WeightOptions) => void;
  let reject!: (error: Error) => void;
  db.getExerciseWeightOptions.mockReturnValueOnce(new Promise((yes, no) => { resolve = yes; reject = no; }));
  const view = await render(<Modal />);
  await view.unmount();
  await act(async () => { if (fail) reject(new Error('late')); else resolve({ weights: [5], increments: [] }); });
  expect(close).not.toHaveBeenCalled();
});
