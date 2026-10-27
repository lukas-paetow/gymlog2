import { useEffect, useState } from 'react';
import { Button, Modal, ScrollView, Text, View } from 'react-native';
import { getDateFormat, initializeDatabase, listExerciseHistory } from '../database';
import type { ExerciseHistorySet } from '../database';
import { DEFAULT_DATE_FORMAT, formatWorkoutDate } from '../dateFormat';
import type { DateFormat } from '../dateFormat';
import ExerciseProgressChart from './ExerciseProgressChart';
import { recentExerciseHistory, setColor } from '../exerciseProgress';
import WeightPicker from './WeightPicker';

type Props = { exerciseId: number; name: string; sessionId: number; onClose: () => void };

/** Read-only past performance; opening it never changes active workout drafts. */
export default function ExerciseHistoryModal({ exerciseId, name, sessionId, onClose }: Props) {
  const [rows, setRows] = useState<ExerciseHistorySet[]>([]);
  const [format, setFormat] = useState<DateFormat>(DEFAULT_DATE_FORMAT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now] = useState(() => new Date());
  const [plotWeight, setPlotWeight] = useState<number | null>(null);
  const [isWeightInteracting, setIsWeightInteracting] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const db = await initializeDatabase();
        const [history, dateFormat] = await Promise.all([listExerciseHistory(db, exerciseId, sessionId), getDateFormat(db)]);
        if (!cancelled) { setRows(history); setFormat(dateFormat); }
      } catch { if (!cancelled) setError(true); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [exerciseId, sessionId]);
  const sessions = new Map<number, ExerciseHistorySet[]>();
  for (const row of rows) sessions.set(row.sessionId, [...(sessions.get(row.sessionId) ?? []), row]);
  const recent = recentExerciseHistory(rows, now);
  const weights = [...new Set(recent.map(row => row.weight))].sort((a, b) => a - b);
  const selectedWeight = plotWeight !== null && weights.includes(plotWeight) ? plotWeight : recent[recent.length - 1]?.weight;
  const plotted = recent.filter(row => row.weight === selectedWeight);
  const recordWeight = selectedWeight ?? rows.find(row => !row.excluded && row.weight !== null)?.weight;
  const recordSets = rows.filter(row => !row.excluded && row.weight !== null && row.weight === recordWeight);
  const recordReps = recordSets.length ? Math.max(...recordSets.map(row => row.reps)) : null;
  // One best set at each recorded weight; heavier weights take priority over reps.
  const bestByWeight = new Map<number, ExerciseHistorySet>();
  for (const row of rows) {
    if (row.excluded || row.weight === null) continue;
    const best = bestByWeight.get(row.weight);
    if (!best || row.reps > best.reps) bestByWeight.set(row.weight, row);
  }
  const bestSets = [...bestByWeight.values()].sort((a, b) => b.weight! - a.weight! || b.reps - a.reps);
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, padding: 24, paddingTop: 48, gap: 16 }}>
      <Text style={{ fontSize: 24 }}>{name} history</Text>
      {!loading && !error && <Text style={{ fontSize: 18, fontWeight: '600' }}>
        {recordReps === null ? 'No tracked PR yet.' : `All-time PR at ${recordWeight} kg: ${recordReps} reps`}
      </Text>}
      <ScrollView scrollEnabled={!isWeightInteracting} contentContainerStyle={{ gap: 16 }}>
        {!loading && !error && bestSets.length > 0 && <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 18 }}>All-time best sets</Text>
          {bestSets.map(set => <View key={set.weight} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>{set.weight} kg × {set.reps} reps</Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>{formatWorkoutDate(set.finishTime, format)}</Text>
          </View>)}
        </View>}
        {!loading && !error && <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 18 }}>Last 2 months</Text>
          {recent.length === 0 ? <Text>No tracked sets with a weight in the last two months.</Text> : <>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text>Weight (kg)</Text>
              <WeightPicker label="History plot weight in kilograms" value={String(selectedWeight)} weights={weights}
                selectionOnly disabled={false} onInteractionChange={setIsWeightInteracting}
                onChange={value => { const weight = Number(value); if (weights.includes(weight)) setPlotWeight(weight); }} />
              <Text>Reps at {selectedWeight} kg</Text>
            </View>
            <ExerciseProgressChart axisLabel="Reps" points={plotted.map(row => ({
              timestamp: new Date(row.finishTime).getTime(), label: formatWorkoutDate(row.finishTime, format),
              value: row.reps, color: setColor(row.setPosition),
            }))} domain={{ start: new Date(recent[0].finishTime).getTime(),
              end: new Date(recent[recent.length - 1].finishTime).getTime(), max: Math.max(...recent.map(row => row.reps)) }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {[...new Set(plotted.map(row => row.setPosition))].sort((a, b) => a - b).map(position =>
                <Text key={position} style={{ color: setColor(position), fontSize: 12 }}>● Set {position + 1}</Text>)}
            </View>
          </>}
        </View>}
        {loading ? <Text>Loading exercise history…</Text> : error ? <Text>Could not load exercise history.</Text>
          : rows.length === 0 ? <Text>No past workouts for this exercise.</Text>
          : [...sessions].map(([id, sets]) => <View key={id} style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12, gap: 6 }}>
            <Text style={{ fontWeight: '600' }}>{formatWorkoutDate(sets[0].finishTime, format)}</Text>
            {[...new Set(sets.map(set => set.comment).filter(Boolean))].map(comment => <Text key={comment}>{comment}</Text>)}
            {sets.map((set, index) => <Text key={index}>Set {set.setPosition + 1}: {set.weight ?? '—'} kg × {set.reps} reps{set.excluded ? ' · Excluded from tracking' : ''}</Text>)}
          </View>)}
      </ScrollView>
      <Button title="Close history" onPress={onClose} />
    </View>
  </Modal>;
}
