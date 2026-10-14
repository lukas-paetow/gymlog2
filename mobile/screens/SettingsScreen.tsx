import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getDateFormat, initializeDatabase, setDateFormat } from '../database';
import { DATE_FORMATS, DEFAULT_DATE_FORMAT, formatWorkoutDate } from '../dateFormat';
import type { DateFormat } from '../dateFormat';

export default function SettingsScreen() {
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
        const saved = await getDateFormat(db);
        if (!cancelled) setFormat(saved);
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
      {isSaving && <Text>Saving…</Text>}
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
