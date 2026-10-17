import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import ExerciseOptionsModal from '../components/ExerciseOptionsModal';

jest.mock('react-native/Libraries/Components/Switch/Switch', () => ({
  default: (props: any) => require('react').createElement(require('react-native').View, { ...props, accessibilityRole: 'switch', accessibilityState: { disabled: props.disabled, checked: props.value } }),
}));
jest.mock('react-native/Libraries/Modal/Modal', () => ({
  default: ({ children, ...props }: any) => require('react').createElement(require('react-native').View, { ...props, testID: 'options-modal' }, children),
}));
const save = jest.fn<Promise<void>, [any]>();
const close = jest.fn();
const initial = { comment: 'Existing', excludeAll: false, excludedPositions: [1] };
beforeEach(() => { jest.resetAllMocks(); save.mockResolvedValue(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

test('comments save without changing exclusion choices; cancel and Android back dismiss', async () => {
  await render(<ExerciseOptionsModal name="Dips" mode="comment" initial={initial} setCount={2} onSave={save} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText('Exercise comment'), 'Unexpected pain');
  await fireEvent.press(screen.getByText('Save comment'));
  expect(save).toHaveBeenCalledWith({ ...initial, comment: 'Unexpected pain' });
  expect(close).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByText('Cancel exercise details'));
  await fireEvent(screen.getByTestId('options-modal'), 'requestClose');
  expect(close).toHaveBeenCalledTimes(3);
});
test('selective exclusions and all-sets toggle are editable', async () => {
  await render(<ExerciseOptionsModal name="Dips" mode="tracking" initial={initial} setCount={3} onSave={save} onClose={close} />);
  await fireEvent(screen.getByLabelText('Exclude set 1'), 'valueChange', true);
  await fireEvent(screen.getByLabelText('Exclude set 2'), 'valueChange', false);
  await fireEvent(screen.getByLabelText('Exclude all sets'), 'valueChange', true);
  expect(screen.getByLabelText('Exclude set 3')).toBeDisabled();
  expect(screen.getByLabelText('Exclude set 3').props.value).toBe(true);
  await fireEvent(screen.getByLabelText('Exclude all sets'), 'valueChange', false);
  await fireEvent.press(screen.getByText('Save tracking choices'));
  expect(save).toHaveBeenCalledWith({ ...initial, excludedPositions: [0] });
});
test('errors preserve the dialog and pending writes block closing and duplicate saves', async () => {
  save.mockRejectedValueOnce(new Error('failed'));
  await render(<ExerciseOptionsModal name="Dips" mode="comment" initial={initial} setCount={2} onSave={save} onClose={close} />);
  await fireEvent.press(screen.getByText('Save comment'));
  expect(Alert.alert).toHaveBeenCalledWith('Save failed', expect.any(String));
  expect(close).not.toHaveBeenCalled();
  let resolve!: () => void;
  save.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  await fireEvent.press(screen.getByText('Save comment'));
  expect(screen.getByText('Cancel exercise details')).toBeDisabled();
  await fireEvent(screen.getByTestId('options-modal'), 'requestClose');
  await fireEvent.press(screen.getByText('Saving…'));
  expect(close).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledTimes(2);
  await act(async () => resolve());
  expect(close).toHaveBeenCalledTimes(1);
});
