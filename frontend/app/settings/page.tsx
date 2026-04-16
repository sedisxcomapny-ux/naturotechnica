"use client";

import { useEffect, useState } from "react";
import AppHeader from "../components/AppHeader";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const REPO_URL = "https://github.com/sedisxcomapny-ux/naturotechnica";

interface FarmProfile {
  farm_name: string;
  location: string;
  primary_crop: string;
  season: string;
}

interface NotificationPrefs {
  email_digest: boolean;
  sms_alerts: boolean;
  urgency_threshold: "High only" | "Medium and above" | "All alerts";
}

interface Settings {
  farm_profile: FarmProfile;
  notifications: NotificationPrefs;
}

const CROP_OPTIONS = ["Corn", "Soy", "Wheat", "Rice", "Cotton"];
const URGENCY_OPTIONS = ["High only", "Medium and above", "All alerts"] as const;

const INPUT_CLS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [recCount, setRecCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/settings`).then((r) => r.json()),
      fetch(`${API}/api/fields`).then((r) => r.json()),
      fetch(`${API}/api/recommendations`).then((r) => r.json()),
    ])
      .then(([settingsJson, fieldsJson, recsJson]) => {
        setSettings(settingsJson.data);
        const fields = fieldsJson.data ?? [];
        if (fields.length > 0) {
          const latest = [...fields].sort((a, b) =>
            (b.created_at ?? "").localeCompare(a.created_at ?? "")
          )[0];
          setLastRun(latest?.created_at ?? null);
        }
        setRecCount((recsJson.data ?? []).length);
      })
      .catch((e) => setError(e.message));
  }, []);

  function updateFarm<K extends keyof FarmProfile>(key: K, value: FarmProfile[K]) {
    setSettings((s) =>
      s ? { ...s, farm_profile: { ...s.farm_profile, [key]: value } } : s
    );
  }

  function updateNotif<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setSettings((s) =>
      s ? { ...s, notifications: { ...s.notifications, [key]: value } } : s
    );
  }

  async function saveSection(section: "farm_profile" | "notifications") {
    if (!settings) return;
    setSaving(section);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [section]: settings[section] }),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      const json = await res.json();
      setSettings(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  async function exportData() {
    try {
      const res = await fetch(`${API}/api/recommendations`);
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recommendations_chicago.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage your farm profile, alerts, and data sources.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {settings && (
          <>
            {/* Farm profile */}
            <Section title="Farm profile">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Farm name">
                  <input
                    type="text"
                    className={INPUT_CLS}
                    value={settings.farm_profile.farm_name}
                    onChange={(e) => updateFarm("farm_name", e.target.value)}
                  />
                </Field>
                <Field label="Location">
                  <input
                    type="text"
                    className={INPUT_CLS}
                    value={settings.farm_profile.location}
                    onChange={(e) => updateFarm("location", e.target.value)}
                  />
                </Field>
                <Field label="Primary crop">
                  <select
                    className={INPUT_CLS}
                    value={settings.farm_profile.primary_crop}
                    onChange={(e) => updateFarm("primary_crop", e.target.value)}
                  >
                    {CROP_OPTIONS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Season">
                  <input
                    type="text"
                    className={`${INPUT_CLS} bg-gray-50 cursor-not-allowed`}
                    value={settings.farm_profile.season}
                    readOnly
                  />
                </Field>
              </div>
              <div className="flex justify-end mt-5">
                <SaveButton
                  busy={saving === "farm_profile"}
                  onClick={() => saveSection("farm_profile")}
                />
              </div>
            </Section>

            {/* Notification preferences */}
            <Section title="Notification preferences">
              <Toggle
                label="Email digest"
                description="Daily summary of new recommendations."
                value={settings.notifications.email_digest}
                onChange={(v) => updateNotif("email_digest", v)}
              />
              <Toggle
                label="SMS alerts"
                description="Text messages for high-urgency events."
                value={settings.notifications.sms_alerts}
                onChange={(v) => updateNotif("sms_alerts", v)}
              />
              <Field label="Urgency threshold">
                <select
                  className={INPUT_CLS}
                  value={settings.notifications.urgency_threshold}
                  onChange={(e) =>
                    updateNotif(
                      "urgency_threshold",
                      e.target.value as NotificationPrefs["urgency_threshold"]
                    )
                  }
                >
                  {URGENCY_OPTIONS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <div className="flex justify-end mt-5">
                <SaveButton
                  busy={saving === "notifications"}
                  onClick={() => saveSection("notifications")}
                />
              </div>
            </Section>
          </>
        )}

        {/* Data sources */}
        <Section title="Data sources">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SourceCard
              title="Weather"
              status="green"
              detail="Open-Meteo API · Updated daily"
            />
            <SourceCard
              title="Satellite"
              status="amber"
              detail="Synthetic NDVI proxy · Weekly"
            />
            <SourceCard
              title="Soil sensors"
              status="gray"
              detail="Not connected"
              cta="Add sensor →"
            />
          </div>
        </Section>

        {/* Platform info */}
        <Section title="Platform info">
          <div className="divide-y divide-gray-100">
            <InfoRow label="Version" value="0.1.0" />
            <InfoRow
              label="Last pipeline run"
              value={lastRun ?? "No pipeline has been run yet"}
            />
            <InfoRow
              label="Total recommendations generated"
              value={recCount === null ? "—" : String(recCount)}
            />
            <InfoRow
              label="GitHub"
              value={
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 hover:text-green-900 underline"
                >
                  sedisxcomapny-ux/naturotechnica
                </a>
              }
            />
          </div>
          <div className="mt-5">
            <button
              type="button"
              onClick={exportData}
              className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition-colors"
            >
              Export farm data
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Downloads recommendations_chicago.json to your device.
            </p>
          </div>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-5">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          value ? "bg-green-700" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function SaveButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="px-5 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? "Saving..." : "Save"}
    </button>
  );
}

function SourceCard({
  title,
  status,
  detail,
  cta,
}: {
  title: string;
  status: "green" | "amber" | "gray";
  detail: string;
  cta?: string;
}) {
  const dotColor = {
    green: "bg-green-500",
    amber: "bg-amber-500",
    gray: "bg-gray-300",
  }[status];
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      </div>
      <p className="text-xs text-gray-600">{detail}</p>
      {cta && (
        <button
          type="button"
          className="text-xs font-semibold text-green-700 hover:text-green-900 mt-2"
        >
          {cta}
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
