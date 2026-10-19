import { useRef, useState } from 'react';
import { Alert, Button, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput } from 'react-native';
import type { FinishedWorkout } from '../database';

type Props = { set: FinishedWorkout['sets'][number]; adding?: boolean; onDelete?: () => Promise<void>;
  onSave: (weight: number | null, reps: number) => Promise<void>; onClose: () => void };

export default function EditLoggedSetModal({ set, adding = false, onDelete, onSave, onClose }: Props) {
  const [weight, setWeight] = useState(set.weight === null ? '' : String(set.weight));
  const [reps, setReps] = useState(String(set.reps));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function save() {
    if (savingRef.current) return;
    const parsedWeight = weight.trim() ? Number(weight.replace(',', '.')) : null;
    const parsedReps = Number(reps);
    if ((parsedWeight !== null && !Number.isFinite(parsedWeight)) || !Number.isInteger(parsedReps) || parsedReps < 1) {
      Alert.alert('Invalid set', 'Enter a valid weight and a positive whole number of reps.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try { await onSave(parsedWeight, parsedReps); onClose(); }
    catch { Alert.alert('Save failed', 'Could not update this set. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  function confirmDelete() {
    if (savingRef.current || !onDelete) return;
    Alert.alert('Delete set?', 'Remove this set? PR markers will be recalculated. If no sets remain, the workout disappears from history.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete set', style: 'destructive', onPress: async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        try { await onDelete(); onClose(); }
        catch { Alert.alert('Delete failed', 'Could not delete the set. Please try again.'); }
        finally { savingRef.current = false; setSaving(false); }
      } },
    ]);
  }
  return <Modal visible animationType="slide" onRequestClose={() => { if (!savingRef.current) onClose(); }}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 24 }}>{adding ? 'Add logged set' : 'Edit logged set'}</Text><Text>{set.exerciseName}</Text>
        <Text>Weight (kg)</Text><TextInput autoFocus accessibilityLabel="Logged weight" keyboardType="default" value={weight} onChangeText={setWeight}
          editable={!saving} style={{ borderWidth: 1, borderColor: '#94a3b8', padding: 12, borderRadius: 8 }} />
        <Text>Reps</Text><TextInput accessibilityLabel="Logged reps" keyboardType="number-pad" value={reps} onChangeText={setReps}
          editable={!saving} style={{ borderWidth: 1, borderColor: '#94a3b8', padding: 12, borderRadius: 8 }} />
        <Text>Saving updates this performance and recalculates this exercise’s PR markers. Routine targets stay unchanged.</Text>
        <Button title={saving ? 'Saving…' : adding ? 'Add logged set' : 'Save logged set'} onPress={save} disabled={saving} />
        {!adding && onDelete && <Button title="Delete logged set" color="#b91c1c" onPress={confirmDelete} disabled={saving} />}
        <Button title="Cancel set edit" onPress={onClose} disabled={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
