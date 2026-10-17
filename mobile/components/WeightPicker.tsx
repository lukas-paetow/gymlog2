import { useState } from 'react';
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
  const available = selectionOnly ? [...new Set(weights)]
    : wheelWeights(weights, increments, Number.isFinite(anchor) ? anchor : current);
  if (!selectionOnly && Number.isFinite(current) && !available.includes(current)) available.push(current);
  available.sort((a, b) => a - b);
  const data = [...(selectionOnly ? [] : [{ value: '', label: '—' }]), ...available.map(weight => ({ value: String(weight), label: String(weight) }))];
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
      accessibilityHint={selectionOnly ? undefined : "Hold to enter a weight manually"} accessibilityState={{ disabled }}
      accessibilityActions={selectionOnly ? undefined : [{ name: 'activate', label: 'Enter weight manually' }]}
      onTouchStart={() => { if (!disabled) onInteractionChange?.(true); }}
      onTouchEnd={() => onInteractionChange?.(false)}
      onTouchCancel={() => onInteractionChange?.(false)}
      onAccessibilityAction={selectionOnly ? undefined : openManual} onLongPress={selectionOnly ? undefined : openManual} disabled={disabled} style={styles.wheel}>
      <WheelPicker data={data} value={Number.isFinite(current) ? String(current) : ''} width={120}
        itemHeight={48} visibleItemCount={3} readOnly={disabled} enableScrollByTapOnItem
        itemTextStyle={{ fontSize: 20, color: '#1e3a8a' }} overlayItemStyle={{ backgroundColor: '#dbeafe' }}
        onValueChanged={({ item }) => {
          if (!disabled) {
            setAnchor(item.value === '' ? NaN : Number(item.value));
            onChange(item.value);
          }
        }} />
    </Pressable>
    {!disabled && !selectionOnly && <Text style={styles.hint}>{weights.length || increments.length ? 'Hold to type' : 'Hold to enter weight'}</Text>}
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
