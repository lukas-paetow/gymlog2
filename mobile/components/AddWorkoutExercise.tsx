import { useRef, useState } from 'react';
import { Alert, Button, Pressable, Text, TextInput, View } from 'react-native';
import { initializeDatabase, listExercises } from '../database';
import type { Exercise } from '../database';

type Props = { existingIds: number[]; disabled: boolean; onAdd: (exercise: Exercise) => Promise<void> };

/** Search the library without modifying the routine or logging unperformed sets. */
export default function AddWorkoutExercise({ existingIds, disabled, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  async function start() {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setLibrary(await listExercises(await initializeDatabase()));
      setQuery('');
      setOpen(true);
    } catch { Alert.alert('Load failed', 'Could not load the exercise library.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function choose(exercise: Exercise) {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    setBusy(true);
    try { await onAdd(exercise); setOpen(false); }
    catch { Alert.alert('Add failed', 'Could not add the exercise. Please try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const matches = library.filter(exercise => !existingIds.includes(exercise.id)
    && exercise.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <View style={{ gap: 10, marginTop: 16 }}>
    {!open ? <Button title={busy ? 'Loading exercises…' : 'Add unplanned exercise'} disabled={busy || disabled} onPress={start} /> : <>
      <TextInput accessibilityLabel="Search exercises for this workout" placeholder="Type an exercise name" autoFocus
        value={query} onChangeText={setQuery} editable={!busy && !disabled}
        style={{ borderWidth: 1, borderColor: '#94a3b8', borderRadius: 8, padding: 12, backgroundColor: '#fff' }} />
      {matches.slice(0, 10).map(exercise => <Pressable key={exercise.id} disabled={busy || disabled}
        accessibilityRole="button" accessibilityLabel={`Add ${exercise.name} to workout`} onPress={() => choose(exercise)}
        style={{ padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, backgroundColor: '#fff' }}>
        <Text>{exercise.name}</Text>
      </Pressable>)}
      {matches.length === 0 && <Text>No matching exercises in your library.</Text>}
      {matches.length > 10 && <Text>Keep typing to narrow the suggestions.</Text>}
      <Button title="Cancel adding exercise" disabled={busy || disabled} onPress={() => setOpen(false)} />
    </>}
  </View>;
}
