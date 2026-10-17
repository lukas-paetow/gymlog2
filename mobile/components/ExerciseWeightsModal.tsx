import { useEffect, useState } from 'react';
import { Alert, Button, Modal, ScrollView, Text } from 'react-native';
import { initializeDatabase, getExerciseWeightOptions, setExerciseWeights } from '../database';
import type { WeightIncrement } from '../weightOptions';
import type { Exercise } from '../database';
import WeightOptionsEditor from './WeightOptionsEditor';

type Props = { exercise: Exercise; exercises: Exercise[]; onClose: () => void };

export default function ExerciseWeightsModal({ exercise, exercises, onClose }: Props) {
  const [weights, setWeights] = useState<number[]>([]);
  const [increments, setIncrements] = useState<WeightIncrement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getExerciseWeightOptions(await initializeDatabase(), exercise.id);
        if (!cancelled) { setWeights(result.weights); setIncrements(result.increments); }
      } catch { if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [exercise.id]);
  async function save() {
    setSaving(true);
    try { await setExerciseWeights(await initializeDatabase(), exercise.id, weights, increments); onClose(); }
    catch { Alert.alert('Save failed', 'Could not save the available weights.'); }
    finally { setSaving(false); }
  }
  return <Modal visible onRequestClose={() => { if (!saving) onClose(); }}>
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 24 }}>{exercise.name}: weights</Text>
      {loading ? <Text>Loading weights…</Text> : error ? <Text>Could not load available weights.</Text> :
        <WeightOptionsEditor increments={increments} onIncrementsChange={setIncrements} weights={weights} onChange={setWeights} disabled={saving}
          exercises={exercises.filter(item => item.id !== exercise.id)}
          onCopy={async id => getExerciseWeightOptions(await initializeDatabase(), id)} />}
      <Button title="Save available weights" onPress={save} disabled={loading || error || saving} />
      <Button title="Cancel weights" onPress={onClose} disabled={saving} />
    </ScrollView>
  </Modal>;
}
