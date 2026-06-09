import React from "react";
import Svg, { G, Path, Circle, Line, Polyline, Text as SvgText, Rect } from "react-native-svg";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/src/theme";

// --- Donut / pie chart for macros ---
export function MacrosDonut({
  protein,
  carbs,
  fat,
  size = 160,
  thickness = 22,
}: {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
  thickness?: number;
}) {
  const { colors } = useTheme();
  // Caloric weight: 4/4/9 per gram. Use kcal share for visual fidelity.
  const pCal = protein * 4;
  const cCal = carbs * 4;
  const fCal = fat * 9;
  const total = pCal + cCal + fCal || 1;
  const segments = [
    { label: "Protein", color: colors.protein, val: pCal },
    { label: "Carbs", color: colors.carbs, val: cCal },
    { label: "Fat", color: colors.fat, val: fCal },
  ];

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let acc = -Math.PI / 2;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={thickness} fill="none" />
        {segments.map((s, i) => {
          const frac = s.val / total;
          if (frac <= 0) return null;
          const start = acc;
          const end = acc + frac * Math.PI * 2;
          acc = end;
          const large = end - start > Math.PI ? 1 : 0;
          const x1 = cx + r * Math.cos(start);
          const y1 = cy + r * Math.sin(start);
          const x2 = cx + r * Math.cos(end);
          const y2 = cy + r * Math.sin(end);
          const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
          return <Path key={i} d={d} stroke={s.color} strokeWidth={thickness} fill="none" strokeLinecap="butt" />;
        })}
      </Svg>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 20 }}>
          {Math.round(protein + carbs + fat)}g
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>total macros</Text>
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[styles.legendTxt, { color: colors.muted }]}>
              {s.label} <Text style={{ color: colors.text, fontWeight: "800" }}>{Math.round(s.val / 9.5)}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// --- Mini bar chart for weekly calories ---
export function WeeklyBars({
  days,
  goal,
  width = 320,
  height = 140,
}: {
  days: { date: string; calories: number }[];
  goal: number;
  width?: number;
  height?: number;
}) {
  const { colors } = useTheme();
  const max = Math.max(goal, ...days.map((d) => d.calories || 0), 1);
  const padX = 24;
  const padY = 22;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const barW = innerW / days.length - 8;

  return (
    <Svg width={width} height={height}>
      {/* goal line */}
      <Line
        x1={padX}
        x2={width - padX}
        y1={padY + innerH - (goal / max) * innerH}
        y2={padY + innerH - (goal / max) * innerH}
        stroke={colors.border}
        strokeWidth={1}
        strokeDasharray="4,4"
      />
      {days.map((d, i) => {
        const h = (d.calories / max) * innerH;
        const x = padX + i * (barW + 8) + 4;
        const y = padY + innerH - h;
        const over = d.calories > goal;
        return (
          <G key={d.date}>
            <Rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(2, h)}
              rx={6}
              fill={over ? colors.danger : colors.primary}
              opacity={d.calories === 0 ? 0.25 : 1}
            />
            <SvgText
              x={x + barW / 2}
              y={height - 4}
              fontSize="10"
              fontWeight="700"
              fill={colors.muted}
              textAnchor="middle"
            >
              {dayLabel(d.date)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// --- Weekly macros stacked line ---
export function MacroTrendLines({
  days,
  width = 320,
  height = 140,
}: {
  days: { date: string; protein: number; carbs: number; fat: number }[];
  width?: number;
  height?: number;
}) {
  const { colors } = useTheme();
  const padX = 24;
  const padY = 14;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const max = Math.max(
    1,
    ...days.flatMap((d) => [d.protein || 0, d.carbs || 0, d.fat || 0])
  );

  const xs = (i: number) => padX + (i * innerW) / Math.max(1, days.length - 1);
  const ys = (v: number) => padY + innerH - (v / max) * innerH;

  const series: { key: "protein" | "carbs" | "fat"; color: string }[] = [
    { key: "protein", color: colors.protein },
    { key: "carbs", color: colors.carbs },
    { key: "fat", color: colors.fat },
  ];

  return (
    <Svg width={width} height={height}>
      {series.map((s) => {
        const pts = days.map((d, i) => `${xs(i)},${ys((d as any)[s.key] || 0)}`).join(" ");
        return (
          <G key={s.key}>
            <Polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {days.map((d, i) => (
              <Circle key={i} cx={xs(i)} cy={ys((d as any)[s.key] || 0)} r={2.5} fill={s.color} />
            ))}
          </G>
        );
      })}
      {days.map((d, i) => (
        <SvgText key={d.date} x={xs(i)} y={height - 2} fontSize="9" fill={colors.muted} textAnchor="middle">
          {dayLabel(d.date)}
        </SvgText>
      ))}
    </Svg>
  );
}

function dayLabel(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00");
    return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { fontSize: 12, fontWeight: "600" },
});
