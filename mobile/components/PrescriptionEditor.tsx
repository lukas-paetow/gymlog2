import { useRef, useState } from 'react';
import { Alert, Button, Text, TextInput, View } from 'react-native';
import type { TrainingDayExercise } from '../database';

type Props = { exercise: TrainingDayExercise; onSave: (exercise: TrainingDayExercise) => Promise<void>; onCancel: () => void };

export default function PrescriptionEditor({ exercise, onSave, onCancel }: Props) {
  const [sets, setSets] = useState(String(exercise.prescribedSets));
  const [reps, setReps] = useState(String(exercise.prescribedRepsFirstSet));
  const [weight, setWeight] = useState(String(exercise.prescribedWeightFirstSet));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function save() {
    if (savingRef.current) return;
    const updated = { ...exercise, prescribedSets: Number(sets), prescribedRepsFirstSet: Number(reps), prescribedWeightFirstSet: Number(weight.replace(',', '.')) };
    if (!Number.isInteger(updated.prescribedSets) || updated.prescribedSets < 1
      || !Number.isInteger(updated.prescribedRepsFirstSet) || updated.prescribedRepsFirstSet < 1
      || !weight.trim() || !Number.isFinite(updated.prescribedWeightFirstSet)) {
      Alert.alert('Invalid prescription', 'Enter positive whole numbers for sets and reps, and a valid weight.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try { await onSave(updated); }
    catch { Alert.alert('Save failed', 'Could not save the prescription.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 20 }}>{exercise.name}</Text>
    <Text>Sets</Text><TextInput accessibilityLabel="Prescribed sets" value={sets} onChangeText={setSets} keyboardType="number-pad" editable={!saving} style={{ borderWidth: 1, padding: 10 }} />
    <Text>First-set reps</Text><TextInput accessibilityLabel="Prescribed first-set reps" value={reps} onChangeText={setReps} keyboardType="number-pad" editable={!saving} style={{ borderWidth: 1, padding: 10 }} />
    <Text>First-set weight (kg)</Text><TextInput accessibilityLabel="Prescribed first-set weight" value={weight} onChangeText={setWeight} keyboardType="default" editable={!saving} style={{ borderWidth: 1, padding: 10 }} />
    <Button title={saving ? 'Saving…' : 'Save prescription'} onPress={save} disabled={saving} />
    <Button title="Cancel prescription" onPress={onCancel} disabled={saving} />
  </View>;
}
