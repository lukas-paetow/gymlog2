import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';

type Props = { value: number | null; target: number; disabled: boolean; label: string; onChange: (reps: number) => void };

/** A stable eight-rep window while dragging; explicit buttons move beyond it. */
export default function RepSlider({ value, target, disabled, label, onChange }: Props) {
  const [center, setCenter] = useState(value ?? target);
  const minimum = Math.max(0, center - 4);
  const maximum = minimum + 8;
  function shift(delta: number) {
    const next = Math.max(0, (value ?? target) + delta);
    setCenter(next);
    onChange(next);
  }
  return <View>
    <Text>Reps: {value ?? '—'}</Text>
    <View style={{ height: 52 }}>
      <Slider disabled={disabled} style={{ height: 40 }} minimumValue={minimum} maximumValue={maximum}
        step={1} value={value ?? target} minimumTrackTintColor="#2563eb" thumbTintColor="#2563eb"
        accessibilityLabel={label} onValueChange={onChange} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 16, left: '5%', right: '5%', flexDirection: 'row', justifyContent: 'space-between' }}>
        {Array.from({ length: 9 }, (_, index) => minimum + index).map(reps => <View key={reps} style={{ width: 0, alignItems: 'center' }}>
          <View style={{ width: 1, height: 8, backgroundColor: '#64748b' }} />
          {reps % 5 === 0 && <Text testID={`rep-tick-label-${reps}`} style={{ position: 'absolute', top: 12, width: 30, fontSize: 10, textAlign: 'center', color: '#64748b' }}>{reps}</Text>}
        </View>)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: five fewer`} disabled={disabled || value === 0}
        onPress={() => shift(-5)} style={{ paddingHorizontal: 14, paddingVertical: 4, opacity: disabled || value === 0 ? 0.4 : 1 }}>
        <Text style={{ fontSize: 26, color: '#2563eb' }}>‹</Text>
      </Pressable>
      <Text style={{ fontSize: 11, color: '#64748b' }}>{minimum}–{maximum}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: five more`} disabled={disabled}
        onPress={() => shift(5)} style={{ paddingHorizontal: 14, paddingVertical: 4, opacity: disabled ? 0.4 : 1 }}>
        <Text style={{ fontSize: 26, color: '#2563eb' }}>›</Text>
      </Pressable>
    </View>
  </View>;
}
