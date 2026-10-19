import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import WeightPicker from '../components/WeightPicker';
import { useState } from 'react';

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  return { default: ({ visible, children, ...props }: any) => visible ? React.createElement(require('react-native').View, { ...props, testID: 'manual-dialog' }, children) : null };
});

jest.mock('@quidone/react-native-wheel-picker', () => {
  const React = require('react');
  return (props: object) => React.createElement(require('react-native').View, { ...props, testID: 'weight-wheel' });
});
const onChange = jest.fn();
async function doubleTap() {
  const target = screen.getByLabelText('Weight');
  for (let i = 0; i < 2; i++) {
    await fireEvent(target, 'touchStart');
    await fireEvent(target, 'touchEnd');
  }
}

test('wheel supports tapping items and reports touch start, release and cancellation', async () => {
  const interaction = jest.fn();
  await render(<WeightPicker weights={[10, 12]} value="10" onChange={onChange}
    onInteractionChange={interaction} disabled={false} label="Weight" />);
  expect(screen.getByTestId('weight-wheel').props.enableScrollByTapOnItem).toBe(true);
  const target = screen.getByLabelText('Weight');
  await fireEvent(target, 'touchStart');
  await fireEvent(target, 'touchEnd');
  await fireEvent(target, 'touchStart');
  await fireEvent(target, 'touchCancel');
  expect(interaction.mock.calls).toEqual([[true], [false], [true], [false]]);
});
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

test('wheel uses sorted configured values, current custom value, and read-only state', async () => {
  const view = await render(<WeightPicker weights={[10, 4, 10, -5]} value="7.5" onChange={onChange} disabled={false} label="Weight" />);
  const wheel = screen.getByTestId('weight-wheel');
  expect(wheel.props.data.map((item: { value: string }) => item.value)).toEqual(['', '-5', '4', '7.5', '10']);
  await fireEvent(wheel, 'valueChanged', { item: { value: '10' } });
  expect(onChange).toHaveBeenCalledWith('10');
  await view.rerender(<WeightPicker weights={[]} value="" onChange={onChange} disabled label="Weight" />);
  expect(screen.getByTestId('weight-wheel').props.readOnly).toBe(true);
  await fireEvent(screen.getByTestId('weight-wheel'), 'valueChanged', { item: { value: '4' } });
  await fireEvent(screen.getByLabelText('Weight'), 'accessibilityAction');
  expect(screen.queryByText('Enter weight (kg)')).toBeNull();
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('double tapping opens manual entry; valid negatives and comma decimals save, cancel does not', async () => {
  await render(<WeightPicker weights={[]} value="" onChange={onChange} disabled={false} label="Weight" />);
  expect(screen.getByText('Double tap to type')).toBeVisible();
  await doubleTap();
  await fireEvent.changeText(screen.getByLabelText('Manual Weight'), '-15,5');
  await fireEvent.press(screen.getByText('Save weight'));
  expect(onChange).toHaveBeenCalledWith('-15.5');
  expect(screen.queryByText('Enter weight (kg)')).toBeNull();
  await doubleTap();
  await fireEvent.changeText(screen.getByLabelText('Manual Weight'), '');
  await fireEvent.press(screen.getByText('Save weight'));
  expect(Alert.alert).toHaveBeenCalledWith('Invalid weight', expect.any(String));
  await fireEvent.press(screen.getByText('Cancel weight'));
  expect(onChange).toHaveBeenCalledTimes(1);
});

test('accessibility activation and Android back open and dismiss manual entry', async () => {
  await render(<WeightPicker weights={[10]} value="10" onChange={onChange} disabled={false} label="Weight" />);
  expect(screen.getByText('Double tap to type')).toBeVisible();
  await fireEvent(screen.getByLabelText('Weight'), 'accessibilityAction');
  const dialog = screen.getByTestId('manual-dialog');
  await fireEvent(dialog, 'requestClose');
  expect(screen.queryByText('Enter weight (kg)')).toBeNull();
});


test('wheel extends open-ended increments after scrolling and supports distant manual values', async () => {
  function Controlled() {
    const [value, setValue] = useState('0');
    return <WeightPicker weights={[17.5]} increments={[{ start: 0, increment: 2.5 }]} value={value}
      onChange={next => { onChange(next); setValue(next); }} disabled={false} label="Weight" />;
  }
  await render(<Controlled />);
  const values = () => screen.getByTestId('weight-wheel').props.data.map((item: { value: string }) => item.value);
  expect(values()).toContain('17.5');
  await fireEvent(screen.getByTestId('weight-wheel'), 'valueChanged', { item: { value: '370' } });
  expect(values()).toContain('495');
  await doubleTap();
  await fireEvent.changeText(screen.getByLabelText('Manual Weight'), '100000');
  await fireEvent.press(screen.getByText('Save weight'));
  expect(values()).toContain('100002.5');
  expect(values().length).toBeLessThan(160);
});

test('keeps weight indices stable under the finger and ignores drag gestures as double taps', async () => {
  await render(<WeightPicker weights={[]} increments={[{ start: 0, increment: 2.5 }]} value="0"
    onChange={onChange} disabled={false} label="Weight" />);
  const before = screen.getByTestId('weight-wheel').props.data;
  const target = screen.getByLabelText('Weight');
  await fireEvent(target, 'touchStart', { nativeEvent: { pageX: 0, pageY: 0 } });
  await fireEvent(target, 'touchMove', { nativeEvent: { pageX: 0, pageY: 60 } });
  await fireEvent(screen.getByTestId('weight-wheel'), 'valueChanged', { item: { value: '370' } });
  expect(screen.getByTestId('weight-wheel').props.data).toBe(before);
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent(target, 'touchEnd', { nativeEvent: { pageX: 0, pageY: 60 } });
  expect(onChange).toHaveBeenCalledWith('370');
  expect(screen.queryByText('Enter weight (kg)')).toBeNull();
});

test('manual custom weights use the dedicated callback so logging can remember them', async () => {
  const manualEntry = jest.fn();
  await render(<WeightPicker weights={[]} value="" onChange={onChange} onManualEntry={manualEntry} disabled={false} label="Weight" />);
  await doubleTap();
  await fireEvent.changeText(screen.getByLabelText('Manual Weight'), '-17,5');
  await fireEvent.press(screen.getByText('Save weight'));
  expect(manualEntry).toHaveBeenCalledWith('-17.5');
  expect(onChange).not.toHaveBeenCalled();
});

test('selecting the dash retains a lone current weight and its item indices', async () => {
  function Controlled() {
    const [value, setValue] = useState('17.5');
    return <WeightPicker weights={[]} value={value} onChange={setValue} disabled={false} label="Weight" />;
  }
  await render(<Controlled />);
  const before = screen.getByTestId('weight-wheel').props.data;
  await fireEvent(screen.getByTestId('weight-wheel'), 'valueChanged', { item: { value: '' } });
  expect(screen.getByTestId('weight-wheel').props.value).toBe('');
  expect(screen.getByTestId('weight-wheel').props.data).toBe(before);
  expect(before.map((item: { value: string }) => item.value)).toEqual(['', '17.5']);
  await fireEvent(screen.getByTestId('weight-wheel'), 'valueChanged', { item: { value: '17.5' } });
  expect(screen.getByTestId('weight-wheel').props.value).toBe('17.5');
});
