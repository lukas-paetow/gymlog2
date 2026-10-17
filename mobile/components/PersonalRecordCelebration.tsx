import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** A new trigger value celebrates a newly saved PR, then hides automatically. */
export default function PersonalRecordCelebration({ trigger }: { trigger: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger === 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    opacity.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1000),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) setVisible(false); });
    return () => animation.stop();
  }, [trigger, opacity]);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.Text accessibilityRole="alert" accessibilityLiveRegion="polite"
        style={[styles.message, {
          opacity,
          transform: [
            { translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            { scale: opacity.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        }]}>
        New personal record!
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 20, left: 20, right: 20, alignItems: 'center' },
  message: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#047857', color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
});
