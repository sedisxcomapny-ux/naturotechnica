"use client";

import { useEffect, useMemo, useState } from "react";
import AppHeader from "../components/AppHeader";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

interface WeatherDay {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_mm: number;
  humidity_pct: number;
  et0_mm: number;
  solar_rad_mjm2: number;
}

interface WeatherSummary {
  total_rain_mm: number;
  avg_temp_c: number;
  max_temp_c: number;
  max_temp_date: string;
  heat_stress_days: number;
  drought_days: number;
}

interface RiskEvent {
  date: string;
  risk_type: string;
  risk_level: string;
  consecutive_days: number;
  probable_cause: string;
  action_text: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function fmtMD(dateStr: string) {
  const [, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

function riskBadge(level: string) {
  const styles: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-green-100 text-green-700",
  };
  return styles[level] ?? "bg-gray-100 text-gray-700";
}

export default function WeatherPage() {
  const [days, setDays] = useState<WeatherDay[]>([]);
  const [summary, setSummary] = useState<WeatherSummary | null>(null);
  const [risks, setRisks] = useState<RiskEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/weather-summary`).then((r) => {
        if (!r.ok) throw new Error(`weather ${r.status}`);
        return r.json();
      }),
      fetch(`${API}/api/disease-risk`).then((r) => {
        if (!r.ok) throw new Error(`disease ${r.status}`);
        return r.json();
      }),
    ])
      .then(([weatherJson, riskJson]) => {
        setDays(weatherJson.data.days);
        setSummary(weatherJson.data.summary);
        setRisks(riskJson.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const weatherByDate = useMemo(() => {
    const m = new Map<string, WeatherDay>();
    days.forEach((d) => m.set(d.date, d));
    return m;
  }, [days]);

  const topRisks = useMemo(() => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...risks]
      .sort(
        (a, b) =>
          (rank[a.risk_level] ?? 9) - (rank[b.risk_level] ?? 9) ||
          b.consecutive_days - a.consecutive_days ||
          a.date.localeCompare(b.date)
      )
      .slice(0, 5);
  }, [risks]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Weather Intelligence</h2>
          <p className="text-sm text-gray-500 mt-1">
            2025 Growing Season · Chicago Pilot Field
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            Failed to load weather data: {error}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Rainfall"
              value={`${summary.total_rain_mm.toFixed(1)} mm`}
              icon="🌧️"
              sub={`over ${days.length} days`}
            />
            <SummaryCard
              label="Peak Temperature"
              value={`${summary.max_temp_c.toFixed(1)}°C`}
              icon="🌡️"
              sub={`on ${summary.max_temp_date}`}
            />
            <SummaryCard
              label="Heat Stress Days"
              value={String(summary.heat_stress_days)}
              icon="🔥"
              sub="days > 35°C"
            />
            <SummaryCard
              label="Drought Days"
              value={String(summary.drought_days)}
              icon="☀️"
              sub="precip < 1 mm"
            />
          </div>
        )}

        {/* Temperature chart */}
        <ChartCard title="Daily Temperature Range">
          {days.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={fmtMD}
                  interval={Math.floor(days.length / 10)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  unit="°C"
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="temp_max_c"
                  fill="#fecaca"
                  stroke="none"
                  name="Range"
                  legendType="none"
                />
                <Area
                  type="monotone"
                  dataKey="temp_min_c"
                  fill="#ffffff"
                  stroke="none"
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="temp_max_c"
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                  name="Max"
                />
                <Line
                  type="monotone"
                  dataKey="temp_min_c"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                  name="Min"
                />
                <ReferenceLine
                  y={35}
                  stroke="#b91c1c"
                  strokeDasharray="4 4"
                  label={{ value: "Heat stress threshold", fontSize: 10, fill: "#b91c1c", position: "insideTopRight" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Rainfall chart */}
        <ChartCard title="Daily Rainfall (mm)">
          {days.length > 0 && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={fmtMD}
                  interval={Math.floor(days.length / 10)}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} unit=" mm" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v) => [`${Number(v).toFixed(1)} mm`, "Rainfall"]}
                />
                <Bar dataKey="precipitation_mm" fill="#16a34a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* ET0 vs rainfall */}
        <ChartCard title="Water Demand vs Rainfall">
          {days.length > 0 && (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickFormatter={fmtMD}
                  interval={Math.floor(days.length / 10)}
                />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} unit=" mm" />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="et0_mm"
                  fill="#fed7aa"
                  stroke="#ea580c"
                  strokeWidth={2}
                  name="ET0 (demand)"
                />
                <Area
                  type="monotone"
                  dataKey="precipitation_mm"
                  fill="#bfdbfe"
                  stroke="#2563eb"
                  strokeWidth={2}
                  name="Rainfall"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-gray-500 mt-2">
            When the orange line rises above blue, the crop is losing more water than it receives.
          </p>
        </ChartCard>

        {/* Disease risk weather windows */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Highest-risk weather windows
          </h3>
          {topRisks.length === 0 && (
            <p className="text-sm text-gray-500">No risk events detected this season.</p>
          )}
          <div className="space-y-3">
            {topRisks.map((r, i) => {
              const w = weatherByDate.get(r.date);
              return (
                <div
                  key={`${r.date}-${r.risk_type}-${i}`}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-medium text-gray-400">{r.date}</span>
                      <h4 className="text-sm font-semibold text-gray-900 mt-0.5 capitalize">
                        {r.risk_type.replace("_", " ")} risk
                      </h4>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${riskBadge(r.risk_level)}`}
                    >
                      {r.risk_level}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{r.probable_cause}</p>
                  {w && (
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>
                        Temp: {w.temp_min_c.toFixed(1)}°C – {w.temp_max_c.toFixed(1)}°C
                      </span>
                      <span>Humidity: {w.humidity_pct.toFixed(0)}%</span>
                      <span>Duration: {r.consecutive_days} days</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-green-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}
