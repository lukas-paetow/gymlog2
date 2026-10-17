export type CalendarTick = { x: number; day: number; showLabel: boolean };
export type CalendarMonth = { x: number; labelX: number; label: string; showLabel: boolean };

/** Local calendar boundaries, positioned on an elapsed-time scale. */
export function buildDateAxis(first: number, last: number, width: number) {
  const start = new Date(first);
  start.setHours(0, 0, 0, 0);
  const end = new Date(last);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const anniversary = new Date(start);
  anniversary.setFullYear(anniversary.getFullYear() + 1);
  const showYears = end >= anniversary;
  const position = (timestamp: number) => (timestamp - start.getTime()) / (end.getTime() - start.getTime()) * width;
  const days: Date[] = [];
  for (const day = new Date(start); day < end; day.setDate(day.getDate() + 1)) days.push(new Date(day));
  const dayWidth = width / days.length;
  const tickStep = Math.max(1, Math.ceil(3 / dayWidth));
  const labelStep = Math.max(1, Math.ceil(28 / dayWidth));
  const ticks: CalendarTick[] = showYears ? [] : days.flatMap((day, index) =>
    index % tickStep === 0 || index % labelStep === 0 ? [{ x: position(day.getTime()), day: day.getDate(), showLabel: index % labelStep === 0 }] : []
  );
  const months: CalendarMonth[] = [];
  for (const month = new Date(start.getFullYear(), start.getMonth(), 1); month < end; month.setMonth(month.getMonth() + 1)) {
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const left = Math.max(0, position(month.getTime()));
    const right = Math.min(width, position(next.getTime()));
    months.push({
      x: left,
      labelX: (left + right) / 2,
      label: month.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      showLabel: !showYears && right - left >= 60,
    });
  }
  const years: CalendarMonth[] = [];
  if (showYears) {
    for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
      const left = Math.max(0, position(new Date(year, 0, 1).getTime()));
      const right = Math.min(width, position(new Date(year + 1, 0, 1).getTime()));
      if (right <= left) continue;
      years.push({ x: left, labelX: (left + right) / 2, label: String(year), showLabel: right - left >= 35 });
    }
  }
  return { position, ticks, months, years };
}
