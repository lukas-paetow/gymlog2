import { useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FinishedWorkout } from '../database';
import type { DateFormat } from '../dateFormat';
import { formatWorkoutDate } from '../dateFormat';
import { localDateKey, monthCells, routineKey } from '../workoutCalendar';

type Props = {
  workouts: FinishedWorkout[];
  dateFormat: DateFormat;
  selectedWorkoutId?: number | null;
  onSelectWorkout: (sessionId: number) => void;
  onLongPressWorkout?: (workout: FinishedWorkout) => void;
};

/** Calendar labels use the training-day names saved with each workout. */
export default function WorkoutCalendar({ workouts, dateFormat, selectedWorkoutId = null, onSelectWorkout, onLongPressWorkout }: Props) {
  const [month, setMonth] = useState(() => {
    const latest = new Date(workouts[0].finishTime);
    return new Date(latest.getFullYear(), latest.getMonth(), 1, 12);
  });
  const [selectedRoutine, setSelectedRoutine] = useState<string | null>(null);
  const routines = new Map<string, string>();
  for (const workout of workouts) {
    if (!routines.has(routineKey(workout))) routines.set(routineKey(workout), workout.routineName);
  }
  const activeKey = selectedRoutine !== null && routines.has(selectedRoutine) ? selectedRoutine : routineKey(workouts[0]);
  const selected = workouts.filter(workout => routineKey(workout) === activeKey);
  const byDate = new Map<string, FinishedWorkout[]>();
  for (const workout of selected) {
    const key = localDateKey(new Date(workout.finishTime));
    const entries = byDate.get(key);
    if (entries) entries.push(workout);
    else byDate.set(key, [workout]);
  }
  const cells = monthCells(month.getFullYear(), month.getMonth());
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));

  return (
    <View style={styles.calendar}>
      <Text style={styles.heading}>Training calendar</Text>
      <ScrollView horizontal contentContainerStyle={styles.routines}>
        {[...routines].map(([key, name]) => <Button key={key} title={name}
          accessibilityLabel={`Calendar routine: ${name}`}
          disabled={key === activeKey} onPress={() => setSelectedRoutine(key)} />)}
      </ScrollView>
      <View style={styles.navigation}>
        <Button title="‹" accessibilityLabel="Previous month"
          onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))} />
        <Text style={styles.month}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        <Button title="›" accessibilityLabel="Next month"
          onPress={() => setMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))} />
      </View>
      <View>
        <View style={styles.week}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day =>
            <View key={day} style={styles.cell}><Text style={styles.weekday}>{day}</Text></View>)}
        </View>
        {weeks.map((week, weekIndex) => <View key={weekIndex} style={styles.week}>
          {week.map((date, index) => {
            if (!date) return <View key={`empty:${index}`} style={styles.cell} />;
            const entries = byDate.get(localDateKey(date)) ?? [];
            return <View key={date.getDate()} style={[styles.cell, styles.dateCell]}
              accessible={false} accessibilityLabel={`${formatWorkoutDate(date.toISOString(), dateFormat)}${entries.map(workout => `, ${workout.trainingDayName}`).join('')}`}>
              <Text style={styles.date}>{date.getDate()}</Text>
              <View style={styles.badges}>
                {entries.map(workout => <Pressable key={workout.id}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${workout.trainingDayName} on ${formatWorkoutDate(workout.finishTime, dateFormat)}`}
                  accessibilityState={{ selected: workout.id === selectedWorkoutId }}
                  onPress={() => onSelectWorkout(workout.id)}
                  onLongPress={() => onLongPressWorkout?.(workout)}
                  style={[styles.session, workout.id === selectedWorkoutId && styles.selectedSession]}>
                  <Text style={styles.badge}>{workout.trainingDayName}</Text>
                </Pressable>)}
              </View>
            </View>;
          })}
        </View>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { padding: 12, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', gap: 12 },
  heading: { fontSize: 20 },
  routines: { gap: 8 },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontSize: 17 },
  week: { flexDirection: 'row' },
  cell: { flex: 1, minWidth: 0, padding: 2 },
  dateCell: { minHeight: 72, borderTopWidth: 1, borderColor: '#e5e7eb' },
  weekday: { textAlign: 'center', fontSize: 11, color: '#6b7280' },
  date: { textAlign: 'center', fontSize: 12, color: '#4b5563' },
  badges: { gap: 3, paddingTop: 4 },
  session: { paddingHorizontal: 2, paddingVertical: 5, borderRadius: 4, backgroundColor: '#dbeafe' },
  selectedSession: { backgroundColor: '#bfdbfe', borderWidth: 1, borderColor: '#2563eb' },
  badge: { textAlign: 'center', fontSize: 10, color: '#1d4ed8', fontWeight: '600' },
});
