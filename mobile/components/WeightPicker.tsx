import { useEffect, useMemo, useRef, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Alert, Button, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { wheelWeights } from '../weightOptions';
import type { WeightIncrement } from '../weightOptions';
import WheelPicker from '@quidone/react-native-wheel-picker';

type Props = { value: string; weights: number[]; increments?: WeightIncrement[]; selectionOnly?: boolean; onChange: (value: string) => void; onManualEntry?: (value: string) => void; onInteractionChange?: (active: boolean) => void; disabled: boolean; label: string };

export default function WeightPicker({ value, weights, increments = [], selectionOnly = false, onChange, onManualEntry, onInteractionChange, disabled, label }: Props) {
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState('');
  const current = value.trim() ? Number(value.replace(',', '.')) : NaN;
  const [anchor, setAnchor] = useState(current);
  const touching = useRef(false);
  const pending = useRef<string | null>(null);
  const touch = useRef<{ x: number; y: number; time: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null);
  const profile = JSON.stringify({ weights, increments });
  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);
  const data = useMemo(() => {
    const configured: { weights: number[]; increments: WeightIncrement[] } = JSON.parse(profile);
    const available = selectionOnly ? [...new Set(configured.weights)]
      : wheelWeights(configured.weights, configured.increments, anchor);
    if (!selectionOnly && Number.isFinite(anchor) && !available.includes(anchor)) available.push(anchor);
    available.sort((a, b) => a - b);
    return [...(selectionOnly ? [] : [{ value: '', label: '—' }]), ...available.map(weight => ({ value: String(weight), label: String(weight) }))];
  }, [profile, anchor, selectionOnly]);
  // Rebase animations only after a committed selection, never under the finger.
  const dataKey = data.map(item => item.value).join('|');
  useEffect(() => {
    if (!touching.current && Number.isFinite(current) && !data.some(item => item.value === String(current))) setAnchor(current);
  }, [current, data]);
  function commit(next: string) {
    // Empty selection must not discard the last custom/generated weight window.
    if (next !== '') setAnchor(Number(next));
    onChange(next);
  }
  function release(event?: GestureResponderEvent, cancelled = false) {
    touching.current = false;
    onInteractionChange?.(false);
    if (pending.current !== null && !disabled) commit(pending.current);
    pending.current = null;
    const start = touch.current;
    touch.current = null;
    const now = Date.now();
    if (cancelled || disabled || selectionOnly || !start || start.moved || now - start.time > 250) {
      lastTap.current = null;
      return;
    }
    const x = event?.nativeEvent.pageX ?? start.x;
    const y = event?.nativeEvent.pageY ?? start.y;
    const previous = lastTap.current;
    if (previous && now - previous.time < 300 && Math.hypot(x - previous.x, y - previous.y) < 24) {
      lastTap.current = null;
      openManual();
    } else lastTap.current = { x, y, time: now };
  }
  function openManual() {
    if (disabled) return;
    setDraft(value);
    setManual(true);
  }
  function saveManual() {
    const weight = Number(draft.trim().replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(weight)) {
      Alert.alert('Invalid weight', 'Enter a valid weight. Negative values mean assistance.');
      return;
    }
    setAnchor(weight);
    (onManualEntry ?? onChange)(String(weight));
    setManual(false);
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityHint={selectionOnly ? undefined : "Double tap to enter a weight manually"} accessibilityState={{ disabled }}
      accessibilityActions={selectionOnly ? undefined : [{ name: 'activate', label: 'Enter weight manually' }]}
      onTouchStart={event => {
        if (disabled) return;
        touching.current = true;
        touch.current = { x: event?.nativeEvent.pageX ?? 0, y: event?.nativeEvent.pageY ?? 0, time: Date.now(), moved: false };
        onInteractionChange?.(true);
      }}
      onTouchMove={event => {
        if (touch.current && Math.hypot(event.nativeEvent.pageX - touch.current.x, event.nativeEvent.pageY - touch.current.y) > 10) touch.current.moved = true;
      }}
      onTouchEnd={event => release(event)}
      onTouchCancel={() => release(undefined, true)}
      onAccessibilityAction={selectionOnly ? undefined : openManual} disabled={disabled} style={styles.wheel}>
      <WheelPicker key={dataKey} data={data} value={Number.isFinite(current) ? String(current) : ''} width={120}
        itemHeight={48} visibleItemCount={3} readOnly={disabled} enableScrollByTapOnItem
        itemTextStyle={{ fontSize: 20, color: '#1e3a8a' }} overlayItemStyle={{ backgroundColor: '#dbeafe' }}
        onValueChanged={({ item }) => {
          if (!disabled) {
            if (touching.current) pending.current = item.value;
            else commit(item.value);
          }
        }} />
    </Pressable>
    {!disabled && !selectionOnly && <Text style={styles.hint}>Double tap to type</Text>}
    <Modal visible={manual} transparent animationType="fade" onRequestClose={() => setManual(false)}>
      {manual && <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={{ fontSize: 20 }}>Enter weight (kg)</Text>
          <TextInput accessibilityLabel={`Manual ${label}`} value={draft} onChangeText={setDraft}
            keyboardType="default" autoFocus style={styles.input} />
          <Button title="Save weight" onPress={saveManual} />
          <Button title="Cancel weight" onPress={() => setManual(false)} />
        </View>
      </View>}
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  wheel: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  hint: { fontSize: 10, color: '#64748b', textAlign: 'center', marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  dialog: { padding: 24, backgroundColor: '#fff', borderRadius: 12, gap: 12 },
  input: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 12 },
});
