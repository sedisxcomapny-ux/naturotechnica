"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import NdviChart from "./components/NdviChart";

const FieldMap = dynamic(() => import("./components/FieldMap"), { ssr: false });

interface Recommendation {
  date: string;
  field_name: string;
  rec_type: string;
  urgency: string;
  title: string;
  action_text: string;
  depletion_score?: number;
  confidence_pct: number;
}

const metrics = [
  { label: "Total Days Monitored", value: "130", icon: "📅" },
  { label: "Irrigation Alerts", value: "52", icon: "💧" },
  { label: "Peak Stress Score", value: "100", icon: "🌡️" },
  { label: "Season Status", value: "Post-Harvest", icon: "🌾" },
];

function urgencyBadge(urgency: string) {
  const styles: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-green-100 text-green-700",
  };
  return styles[urgency] ?? "bg-gray-100 text-gray-700";
}

export default function Home() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peakScore, setPeakScore] = useState<number | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/recommendations?urgency=high")
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json();
      })
      .then((json) => {
        const cards: Recommendation[] = json.data.slice(0, 5);
        setRecs(cards);
        const maxScore = cards.reduce(
          (max, c) => Math.max(max, c.depletion_score ?? 0),
          0
        );
        setPeakScore(maxScore);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-800 text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-400 flex items-center justify-center text-green-900 font-bold text-lg">
              N
            </div>
            <h1 className="text-xl font-bold tracking-tight">Naturotechnica</h1>
          </div>
          <nav className="flex gap-6 text-sm font-medium text-green-200">
            <a href="#" className="text-white">
              Dashboard
            </a>
            <Link href="/onboarding" className="hover:text-white transition-colors">
              Fields
            </Link>
            <a href="#" className="hover:text-white transition-colors">
              Weather
            </a>
            <a href="#" className="hover:text-white transition-colors">
              Settings
            </a>
          </nav>
        </div>
      </header>

      {/* Season banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800">
          <span className="font-semibold">Season:</span>
          2025 Growing Season (Historical)
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">
                  {m.label}
                </span>
                <span className="text-xl">{m.icon}</span>
              </div>
              <p className="text-2xl font-bold text-green-800">{m.value}</p>
            </div>
          ))}
        </div>

        {/* NDVI chart */}
        <NdviChart />

        {/* Map + Recommendations side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Map */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pilot Field
            </h2>
            <FieldMap depletionScore={peakScore} />
          </div>

          {/* Recommendations feed */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                High-Urgency Recommendations
              </h2>
              <Link
                href="/onboarding"
                className="px-3 py-1.5 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-800 transition-colors"
              >
                + Add New Field
              </Link>
            </div>

            {loading && (
              <div className="text-gray-500 py-8 text-center">
                Loading recommendations...
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                Failed to load recommendations: {error}
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-3">
                {recs.map((rec, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <span className="text-xs font-medium text-gray-400">
                          {rec.date}
                        </span>
                        <h3 className="text-sm font-semibold text-gray-900 mt-0.5">
                          {rec.title}
                        </h3>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${urgencyBadge(rec.urgency)}`}
                      >
                        {rec.urgency}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {rec.action_text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
