// Native gestures are checked in Expo. Tests keep our ordering and save callbacks real.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-sortables', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return { __esModule: true, default: {
    Grid: ({ data, renderItem, ...props }: any) => React.createElement(View, { ...props, data, testID: 'sortable-grid' },
      data.map((item: any, index: number) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item, index })))),
    Flex: ({ children, ...props }: any) => React.createElement(View, { ...props, testID: 'sortable-flex' }, children),
    Touchable: ({ onTap, ...props }: any) => React.createElement(Pressable, { ...props, onPress: onTap }),
    Handle: ({ children }: any) => React.createElement(View, {}, children),
  } };
});
