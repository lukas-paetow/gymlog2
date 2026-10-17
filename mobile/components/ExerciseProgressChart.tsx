import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Text as SvgText } from 'react-native-svg';
import { LineChart } from 'react-native-gifted-charts';
import { buildDateAxis } from '../chartDateAxis';

export type ProgressChartPoint = { timestamp: number; label: string; value: number; color?: string };

const HEIGHT = 200;
const POINT_RADIUS = 3;
const EDGE_PADDING = 12;

/** Rendering only: callers choose the metric and prepare chronologically ordered points. */
type Props = {
  points: ProgressChartPoint[];
  domain?: { start: number; end: number; max: number };
  axisLabel?: string;
};

export default function ExerciseProgressChart({ points, domain, axisLabel = 'Reps' }: Props) {
  const [width, setWidth] = useState(0);
  const highest = domain?.max ?? Math.max(...points.map(point => point.value));
  const maxValue = Math.max(5, Math.ceil((highest + Math.max(1, highest * 0.1)) / 5) * 5);
  const yAxisWidth = Math.max(36, String(maxValue).length * 7 + 12);
  // Reserve space for axis numbers and the library's extra point radius.
  const plotWidth = Math.max(1, width - yAxisWidth - 1 - POINT_RADIUS);
  const calendarWidth = Math.max(1, plotWidth - 2 * EDGE_PADDING);
  const axis = buildDateAxis(domain?.start ?? points[0].timestamp, domain?.end ?? points[points.length - 1].timestamp, calendarWidth);
  const data = points.map(point => ({ value: point.value, dataPointColor: point.color, x: EDGE_PADDING + axis.position(point.timestamp) }));

  return (
    <View testID="progress-chart" onLayout={event => setWidth(event.nativeEvent.layout.width)}>
      <Text style={styles.axisLabel}>{axisLabel}</Text>
      <View style={styles.plot}>
        {width > 0 && <>
          <LineChart data={data} width={plotWidth} height={HEIGHT}
            xOffset={0} xScale={1} spacing={0} initialSpacing={0} endSpacing={POINT_RADIUS + 2}
            thickness={0} color="#2563eb" dataPointsColor="#2563eb" dataPointsRadius={POINT_RADIUS}
            maxValue={maxValue} noOfSections={5}
            yAxisLabelWidth={yAxisWidth} yAxisThickness={1} yAxisExtraHeight={0}
            xAxisLabelsHeight={0} rulesLength={plotWidth} disableScroll showFractionalValues={false} />
          <Svg pointerEvents="none" width={width} height={HEIGHT + 52} style={StyleSheet.absoluteFill}>
            <G x={yAxisWidth + 1 + EDGE_PADDING}>
              {axis.months.map(month => <G key={month.label}>
                <Line x1={month.x} x2={month.x} y1={0} y2={HEIGHT} stroke="#d1d5db" strokeWidth={1} />
                {month.showLabel && <SvgText x={month.labelX} y={HEIGHT + 44} fontSize={12}
                  fill="#6b7280" textAnchor="middle">{month.label}</SvgText>}
              </G>)}
              {axis.years.map(year => <G key={year.label}>
                <Line x1={year.x} x2={year.x} y1={0} y2={HEIGHT} stroke="#9ca3af" strokeWidth={1.5} />
                {year.showLabel && <SvgText x={year.labelX} y={HEIGHT + 44} fontSize={12}
                  fill="#6b7280" textAnchor="middle">{year.label}</SvgText>}
              </G>)}
              {axis.ticks.map(tick => <G key={tick.x}>
                <Line x1={tick.x} x2={tick.x} y1={HEIGHT} y2={HEIGHT + 5} stroke="#9ca3af" />
                {tick.showLabel && <SvgText x={tick.x} y={HEIGHT + 20} fontSize={11}
                  fill="#6b7280" textAnchor="middle">{tick.day}</SvgText>}
              </G>)}
            </G>
          </Svg>
        </>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axisLabel: { marginBottom: 16 },
  plot: { height: HEIGHT + 56 },
});
