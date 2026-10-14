import { registerRootComponent } from 'expo';
import App from '../App';

jest.mock('expo', () => ({ registerRootComponent: jest.fn() }));
jest.mock('../App', () => jest.fn(() => null));

test('registers the application with Expo', () => {
  require('../index');
  expect(registerRootComponent).toHaveBeenCalledTimes(1);
  expect(registerRootComponent).toHaveBeenCalledWith(App);
});
