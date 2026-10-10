import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'ActiveSession'
>;

export default function ActiveSessionScreen({ route }: Props) {
  const sessionId = route.params.sessionId;

  return (
    <View>
      <Text>Active session: {sessionId}</Text>
    </View>
  );
}
