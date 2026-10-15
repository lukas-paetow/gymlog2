import { registerRootComponent } from 'expo';
import App from '../App';

jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));
jest.mock('../App', () => jest.fn(() => null));

// Lower priority: startup wiring smoke test, expo; it does not verify a native app launch.
test('registers the application with Expo', () => {
  require('../index');
  expect(registerRootComponent).toHaveBeenCalledTimes(1);
  expect(registerRootComponent).toHaveBeenCalledWith(App);
});
