import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDateFormat, getProgressionMode, initializeDatabase, seedDemoHistory, setDateFormat, setProgressionMode } from '../database';
import { DATE_FORMATS, DEFAULT_DATE_FORMAT, formatWorkoutDate } from '../dateFormat';
import type { ProgressionMode } from '../database';
import type { DateFormat } from '../dateFormat';
import { importLegacy } from '../legacyImport';

export default function SettingsScreen() {
  const [progression, setProgression] = useState<ProgressionMode>('hypertrophy');
  const [format, setFormat] = useState<DateFormat>(DEFAULT_DATE_FORMAT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    async function loadSettings() {
      setIsLoading(true);
      setError(null);
      try {
        const db = await initializeDatabase();
        const [saved, mode] = await Promise.all([getDateFormat(db), getProgressionMode(db)]);
        if (!cancelled) { setFormat(saved); setProgression(mode); }
      } catch (cause) {
        console.error('Loading settings failed:', cause);
        if (!cancelled) setError('Could not load settings.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadSettings();
    return () => { cancelled = true; };
  }, []));

  async function selectFormat(next: DateFormat) {
    if (savingRef.current || isLoading || next === format) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const db = await initializeDatabase();
      await setDateFormat(db, next);
      setFormat(next);
    } catch (cause) {
      console.error('Saving settings failed:', cause);
      Alert.alert('Save failed', 'Could not save the date format. Please try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function selectProgression(next: ProgressionMode) {
    if (savingRef.current || isLoading || error || next === progression) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await setProgressionMode(await initializeDatabase(), next);
      setProgression(next);
    } catch {
      Alert.alert('Save failed', 'Could not save the progression mode. Please try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function addDemoHistory() {
    if (savingRef.current || isLoading || error) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const db = await initializeDatabase();
      const added = await seedDemoHistory(db);
      Alert.alert(added ? 'Demo history added' : 'Demo history already added',
        added ? 'Demo history is ready, including varied squat working sets. Demo exercises are in the library.'
          : 'This dataset has already been added.');
    } catch (cause) {
      console.error('Adding demo history failed:', cause);
      Alert.alert('Demo data failed', 'Could not add the demo history. Please try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  async function addLegacyHistory() {
    if (savingRef.current || isLoading || error) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const result = await importLegacy(await initializeDatabase());
      Alert.alert(result.added ? 'Legacy imported' : 'Legacy already imported', result.added
        ? `${result.workouts} workouts and ${result.sets} sets imported. ${result.exercisesCreated} exercises added to the library.`
        : 'This dataset has already been imported.');
    } catch (cause) {
      console.error('Importing Legacy failed:', cause);
      Alert.alert('Import failed', 'Legacy was not imported. Please try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  const example = new Date(2026, 10, 23, 12).toISOString();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Settings</Text>
      <Text style={styles.title}>Date format</Text>
      <Text>Choose how dates appear in workout history.</Text>
      {isLoading ? <Text>Loading settings…</Text> : error ? <Text>{error}</Text> : (
        <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
          {DATE_FORMATS.map(option => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: format === option, disabled: isSaving }}
              disabled={isSaving}
              onPress={() => selectFormat(option)}
              style={[styles.option, format === option && styles.selected, isSaving && { opacity: 0.6 }]}
            >
              <Text style={styles.title}>{format === option ? '●' : '○'} {option === 'system' ? 'System' : option}</Text>
              <Text>Example: {formatWorkoutDate(example, option)}</Text>
              {option === 'system' && <Text>Use the device’s locale.</Text>}
            </Pressable>
          ))}
        </View>
      )}
      {!isLoading && !error && <>
        <Text style={styles.title}>Workout targets</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Workout target mode" style={{ gap: 12 }}>
          {(['hypertrophy', 'fixed'] as const).map(mode => <Pressable key={mode}
            accessibilityRole="radio" accessibilityLabel={mode === 'hypertrophy' ? 'Hypertrophy (+1 rep)' : 'Fixed targets'}
            accessibilityState={{ checked: progression === mode, disabled: isSaving }} disabled={isSaving}
            onPress={() => selectProgression(mode)} style={[styles.option, progression === mode && styles.selected]}>
            <Text style={styles.title}>{progression === mode ? '●' : '○'} {mode === 'hypertrophy' ? 'Hypertrophy (+1 rep)' : 'Fixed targets'}</Text>
            <Text>{mode === 'hypertrophy' ? 'After a rep PR, set the prescribed target to that rep count + 1.'
              : 'Keep prescribed targets unchanged. PRs are still recorded.'}</Text>
          </Pressable>)}
        </View>
      </>}
      {isSaving && <Text>Saving…</Text>}
      <View style={{ gap: 12, marginTop: 24 }}>
        <Text style={styles.title}>Legacy history</Text>
        <Text>Import your reviewed 2024–2026 logs once. Exercises appear in the library; history is labeled Legacy.</Text>
        <Button title="Import Legacy" onPress={addLegacyHistory} disabled={isLoading || isSaving || error !== null} />
      </View>
      {__DEV__ && (
        <View style={{ gap: 12, marginTop: 24 }}>
          <Text style={styles.title}>Demo history</Text>
          <Text>Add 18 demo workouts, or enrich existing demo squat working sets, to explore history and plots.</Text>
          <Button title="Add demo history" onPress={addDemoHistory} disabled={isLoading || isSaving || error !== null} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  heading: { fontSize: 24 },
  title: { fontSize: 18 },
  option: { padding: 16, gap: 6, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#fff' },
  selected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
});
