import { useEffect, useState } from 'react';
import { Alert, Button, KeyboardAvoidingView, Modal, Platform, Text, TextInput, View } from 'react-native';
import { initializeDatabase, listExerciseNotes, saveExerciseNote } from '../database';
import type { Exercise } from '../database';

type Props = { exercise: Exercise; onClose: () => void; onSaved?: (note: string) => void };

export default function ExerciseNoteModal({ exercise, onClose, onSaved }: Props) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listExerciseNotes(await initializeDatabase());
        if (!cancelled) setNote(rows.find(row => row.exerciseId === exercise.id)?.note ?? '');
      } catch { if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [exercise.id]);
  async function save() {
    setSaving(true);
    try { await saveExerciseNote(await initializeDatabase(), exercise.id, note); onSaved?.(note.trim()); onClose(); }
    catch { Alert.alert('Save failed', 'Could not save the exercise note.'); }
    finally { setSaving(false); }
  }
  return <Modal visible onRequestClose={() => { if (!saving) onClose(); }}>
    <KeyboardAvoidingView style={{ flex: 1, padding: 24, paddingTop: 48, gap: 16 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={{ fontSize: 24 }}>{exercise.name}: setup note</Text>
      {error && <Text>Could not load the exercise note.</Text>}
      <TextInput accessibilityLabel="Exercise setup note" placeholder="Chair height, machine settings…" multiline
        style={{ minHeight: 120, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, textAlignVertical: 'top' }}
        value={note} onChangeText={setNote} editable={!loading && !saving && !error} />
      <View style={{ gap: 12 }}>
        <Button title="Save setup note" onPress={save} disabled={loading || saving || error} />
        <Button title="Cancel note" onPress={onClose} disabled={saving} />
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
