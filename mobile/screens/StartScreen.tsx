import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import type { SortableGridRenderItem } from 'react-native-sortables';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getStartScreenOrder, initializeDatabase, setStartScreenOrder } from '../database';

type Props = NativeStackScreenProps<RootStackParamList, 'Start'>;
const options = [
  { title: 'Start Workout Session', route: 'Session' },
  { title: 'Routines', route: 'Routines' },
  { title: 'Exercise library', route: 'ExerciseLibrary' },
  { title: 'Workout history', route: 'WorkoutHistory' },
  { title: 'Settings', route: 'Settings' },
] as const;
type Option = (typeof options)[number];

export default function StartScreen({ navigation }: Props) {
  const [items, setItems] = useState<Option[]>([...options]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const order = await getStartScreenOrder(await initializeDatabase());
        const restored = order.flatMap(key => options.filter(option => option.route === key));
        const unique = [...new Set(restored)];
        if (!cancelled) setItems([...unique, ...options.filter(option => !unique.includes(option))]);
      } catch { if (!cancelled) Alert.alert('Load failed', 'Could not load the start-screen layout.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function reorder(next: Option[]) {
    if (savingRef.current || loading) return;
    savingRef.current = true;
    const previous = items;
    setItems(next);
    setSaving(true);
    try { await setStartScreenOrder(await initializeDatabase(), next.map(item => item.route)); }
    catch { setItems(previous); Alert.alert('Save failed', 'Could not save the start-screen layout.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const renderItem = useCallback<SortableGridRenderItem<Option>>(({ item: option }) => (
    <Sortable.Touchable accessibilityRole="button" accessibilityLabel={option.title}
      accessibilityHint="Tap to open; hold and drag to reorder" accessibilityState={{ disabled: saving }}
      onTap={() => { if (!saving) navigation.navigate(option.route); }}
      accessibilityActions={[{ name: 'activate', label: 'Open' }]}
      onAccessibilityAction={() => { if (!saving) navigation.navigate(option.route); }} style={styles.tile}>
      <Text style={styles.label}>{option.title}</Text>
    </Sortable.Touchable>
  ), [navigation, saving]);
  return (
    <Animated.ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.grid}>
        <Sortable.Grid columns={2} data={items} renderItem={renderItem} keyExtractor={option => option.route}
          rowGap={12} columnGap={12} scrollableRef={scrollRef} sortEnabled={!loading && !saving}
          dragActivationDelay={400} activeItemScale={1.04} inactiveItemOpacity={0.75}
          onDragEnd={({ data, fromIndex, toIndex }) => { if (fromIndex !== toIndex) void reorder(data); }} />
      </View>
      <StatusBar style="auto" />
    </Animated.ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ababab' },
  container: { flexGrow: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  grid: { width: '100%', maxWidth: 440 },
  tile: { width: '100%', aspectRatio: 1, padding: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12 },
  label: { fontSize: 18, fontWeight: '600', color: '#1e3a8a', textAlign: 'center' },
});
