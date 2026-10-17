import { useCallback, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { getDateFormat, initializeDatabase, listExerciseProgress } from '../database';
import type { ExerciseProgressPoint } from '../database';
import { DEFAULT_DATE_FORMAT, formatWorkoutDate } from '../dateFormat';
import type { DateFormat } from '../dateFormat';
import { sessionVolumes, setColor, topSets } from '../exerciseProgress';
import WeightPicker from '../components/WeightPicker';
import ExerciseProgressChart from '../components/ExerciseProgressChart';

type Props = NativeStackScreenProps<RootStackParamList, 'Progress'>;

export default function ProgressScreen({ route }: Props) {
  const [isWeightInteracting, setIsWeightInteracting] = useState(false);
  const { exerciseId, exerciseName } = route.params;
  const [history, setHistory] = useState<ExerciseProgressPoint[]>([]);
  const [metric, setMetric] = useState<'reps' | 'volume'>('reps');
  const [topOnly, setTopOnly] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>(DEFAULT_DATE_FORMAT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        const db = await initializeDatabase();
        const [rows, format] = await Promise.all([listExerciseProgress(db, exerciseId), getDateFormat(db)]);
        if (cancelled) return;
        setHistory(rows);
        setDateFormat(format);
        const weights = rows.map(row => row.weight);
        setWeight(current => current !== null && weights.includes(current) ? current : rows.length ? Math.max(...weights) : null);
      } catch (cause) {
        console.error('Loading exercise progress failed:', cause);
        if (!cancelled) setError('Could not load exercise progress.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [exerciseId]));

  const hasAssistance = history.some(row => row.weight < 0);
  const isVolume = metric === 'volume' && !hasAssistance;
  const weights = [...new Set(history.map(row => row.weight))].sort((a, b) => b - a);
  const visible = topOnly ? topSets(history) : history;
  const allVolumes = hasAssistance ? [] : sessionVolumes(history);
  const volumes = hasAssistance ? [] : sessionVolumes(visible);
  const selected = visible.filter(row => row.weight === weight);
  const positions = [...new Set(selected.map(row => row.setPosition))].sort((a, b) => a - b);
  const points = isVolume ? volumes.map(row => ({
    timestamp: Date.parse(row.finishTime),
    label: formatWorkoutDate(row.finishTime, dateFormat),
    value: row.volume,
    color: '#2563eb',
  })) : selected.map(row => ({
    timestamp: new Date(row.finishTime).getTime(),
    label: formatWorkoutDate(row.finishTime, dateFormat),
    value: row.reps,
    color: setColor(row.setPosition),
  }));

  return (
    <ScrollView scrollEnabled={!isWeightInteracting} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{exerciseName}</Text>
      {loading ? <Text>Loading progress…</Text> : error ? <Text>{error}</Text> : history.length === 0 ? (
        <Text>No finished workouts with a recorded weight yet.</Text>
      ) : (
        <>
          <Button title={isVolume ? 'Show reps' : 'Show volume'} disabled={hasAssistance}
            onPress={() => setMetric(isVolume ? 'reps' : 'volume')} />
          {hasAssistance && <Text>Volume is unavailable for assisted exercises without body weight.</Text>}
          <Text>{isVolume ? 'Volume per workout (kg · reps)' : 'Reps at selected weight'}</Text>
          {!isVolume && <View style={{ alignItems: 'center' }}>
            <Text>Weight (kg)</Text>
            <WeightPicker label="Plot weight in kilograms" value={String(weight)} weights={weights}
              onInteractionChange={setIsWeightInteracting}
              selectionOnly disabled={false} onChange={value => {
                const selectedWeight = Number(value);
                if (weights.includes(selectedWeight)) setWeight(selectedWeight);
              }} />
          </View>}
          <Button title={topOnly ? 'Show all sets' : 'Show top sets only'} onPress={() => setTopOnly(current => !current)} />
          <Text>{isVolume
            ? (topOnly ? 'Volume of the heaviest set per workout.' : 'Volume across all sets of this exercise per workout.')
            : (topOnly ? 'Top sets only: heaviest weight per workout; most reps breaks ties.' : 'All completed sets at this weight.')}</Text>
          {!isVolume && <View style={styles.weights}>
            {positions.map(position => <View key={position} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: setColor(position) }]} />
              <Text>Set {position + 1}</Text>
            </View>)}
          </View>}
          {points.length === 0 ? <Text>No top sets at this weight.</Text> :
          <ExerciseProgressChart points={points} axisLabel={isVolume ? 'Volume (kg · reps)' : 'Reps'} domain={{
            start: Date.parse(history[0].finishTime),
            end: Date.parse(history[history.length - 1].finishTime),
            max: isVolume ? Math.max(...allVolumes.map(row => row.volume)) : Math.max(...history.map(row => row.reps)),
          }} />}
          {isVolume ? volumes.map(row => <Text key={row.sessionId}>
            {formatWorkoutDate(row.finishTime, dateFormat)}: {row.volume} kg · reps
          </Text>) : selected.map(row => <Text key={row.id}>
            {formatWorkoutDate(row.finishTime, dateFormat)}: Set {row.setPosition + 1} · {row.reps} reps
          </Text>)}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  heading: { fontSize: 24 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  weights: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
