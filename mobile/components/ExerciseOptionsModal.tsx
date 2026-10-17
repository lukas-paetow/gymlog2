import { useRef, useState } from 'react';
import { Alert, Button, Modal, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { ExerciseAnnotation } from '../database';

type Props = {
  name: string;
  mode: 'comment' | 'tracking';
  initial: ExerciseAnnotation;
  setCount: number;
  onSave: (annotation: ExerciseAnnotation) => Promise<void>;
  onClose: () => void;
  onSkip?: () => void;
};

export default function ExerciseOptionsModal({ name, mode, initial, setCount, onSave, onClose, onSkip }: Props) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try { await onSave(draft); onClose(); }
    catch { Alert.alert('Save failed', 'Could not save the exercise details. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <Modal visible onRequestClose={() => { if (!savingRef.current) onClose(); }}>
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 24 }}>{name}</Text>
      {mode === 'comment' ? <>
        <Text>Exercise comment</Text>
        <TextInput accessibilityLabel="Exercise comment" multiline value={draft.comment} editable={!saving}
          onChangeText={comment => setDraft(current => ({ ...current, comment }))}
          style={{ minHeight: 120, borderWidth: 1, borderColor: '#94a3b8', padding: 12, textAlignVertical: 'top' }} />
      </> : <>
        <Text>Excluded sets stay in the workout log and weight defaults, but do not count toward PRs or plots.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text>All sets, including sets added later</Text>
          <Switch accessibilityLabel="Exclude all sets" value={draft.excludeAll} disabled={saving}
            onValueChange={excludeAll => setDraft(current => ({ ...current, excludeAll }))} />
        </View>
        {Array.from({ length: setCount }, (_, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text>Set {index + 1}</Text>
          <Switch accessibilityLabel={`Exclude set ${index + 1}`} value={draft.excludeAll || draft.excludedPositions.includes(index)}
            disabled={saving || draft.excludeAll} onValueChange={excluded => setDraft(current => ({
              ...current, excludedPositions: excluded ? [...current.excludedPositions, index] : current.excludedPositions.filter(position => position !== index),
            }))} />
        </View>)}
        {onSkip && <Button title="Skip exercise" onPress={onSkip} disabled={saving} />}
      </>}
      <Button title={saving ? 'Saving…' : mode === 'comment' ? 'Save comment' : 'Save tracking choices'} disabled={saving} onPress={() => { void save(); }} />
      <Button title="Cancel exercise details" disabled={saving} onPress={onClose} />
    </ScrollView>
  </Modal>;
}
