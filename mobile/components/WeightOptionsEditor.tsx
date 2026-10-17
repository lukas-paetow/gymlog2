import { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { WeightIncrement, WeightOptions } from '../weightOptions';
import type { Exercise } from '../database';
import { normalizeIncrements, normalizeWeights } from '../weightOptions';

type Props = {
  weights: number[];
  increments: WeightIncrement[];
  onIncrementsChange: (rules: WeightIncrement[]) => void;
  onChange: (weights: number[]) => void;
  exercises: Exercise[];
  onCopy: (exerciseId: number) => Promise<WeightOptions>;
  disabled?: boolean;
};

export default function WeightOptionsEditor({ weights, increments, onIncrementsChange, onChange, exercises, onCopy, disabled = false }: Props) {
  const [from, setFrom] = useState('');
  const [step, setStep] = useState('');
  const [custom, setCustom] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const busy = disabled || copying;
  const number = (text: string) => text.trim() ? Number(text.trim().replace(',', '.')) : NaN;

  function addIncrement() {
    try { onIncrementsChange(normalizeIncrements([...increments, { start: number(from), increment: number(step) }])); }
    catch (cause) { Alert.alert('Invalid increment', (cause as Error).message); }
  }
  function addCustom() {
    try {
      onChange(normalizeWeights([...weights, number(custom)]));
      setCustom('');
    } catch (cause) { Alert.alert('Invalid weight', (cause as Error).message); }
  }
  async function copy(exerciseId: number) {
    setCopying(true);
    try {
      const result = await onCopy(exerciseId);
      onChange(result.weights);
      onIncrementsChange(result.increments);
      setCopyOpen(false);
    } catch { Alert.alert('Copy failed', 'Could not load the available weights.'); }
    finally { setCopying(false); }
  }

  return <View style={styles.container}>
    <Text style={styles.title}>Available weights (kg)</Text>
    <Text>Add starting weights and increments. Each increment continues until the next starting weight; the last continues as you scroll. Negative weights mean assistance.</Text>
    <View style={styles.row}>
      <TextInput style={styles.input} accessibilityLabel="Starting weight" placeholder="Start" value={from} onChangeText={setFrom} keyboardType="default" editable={!busy} />
      <TextInput style={styles.input} accessibilityLabel="Weight increment" placeholder="Step" value={step} onChangeText={setStep} keyboardType="default" editable={!busy} />
    </View>
    <Button title="Add weight increment" onPress={addIncrement} disabled={busy} />
    {increments.map(rule => <View key={rule.start} style={styles.row}>
      <Text>From {rule.start} kg: +{rule.increment} kg</Text>
      <Button title="Remove increment" accessibilityLabel={`Remove increment from ${rule.start} kg`}
        onPress={() => onIncrementsChange(increments.filter(item => item.start !== rule.start))} disabled={busy} />
    </View>)}
    <TextInput style={styles.input} accessibilityLabel="Custom weight" placeholder="e.g. 17.5" value={custom} onChangeText={setCustom} keyboardType="default" editable={!busy} />
    <Button title="Add custom weight" onPress={addCustom} disabled={busy} />
    <Button title="Copy weights from another exercise" onPress={() => setCopyOpen(current => !current)} disabled={busy} />
    {copyOpen && <>
      <Text>Copy replaces this list. Later edits stay independent.</Text>
      {exercises.length === 0 && <Text>No other exercises to copy from.</Text>}
      {exercises.map(exercise => <Button key={exercise.id} title={`Copy from ${exercise.name}`} onPress={() => copy(exercise.id)} disabled={busy} />)}
    </>}
    {weights.length === 0 && increments.length === 0 ? <Text>No weights configured. Manual entry will remain available.</Text> : <>
      {weights.length > 0 && <Text>{weights.join(' · ')} kg</Text>}
      <View style={styles.row}>
        {weights.map(weight => <Button key={weight} title={`× ${weight}`} accessibilityLabel={`Remove ${weight} kg`} onPress={() => onChange(weights.filter(value => value !== weight))} disabled={busy} />)}
      </View>
      <Button title="Clear weights" onPress={() => { onChange([]); onIncrementsChange([]); }} disabled={busy} />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 10 }, title: { fontSize: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { flexGrow: 1, minWidth: 60, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 6, padding: 10 },
});
