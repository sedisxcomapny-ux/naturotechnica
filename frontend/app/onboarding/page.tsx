"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const OnboardingMap = dynamic(() => import("../components/OnboardingMap"), { ssr: false });

type Step = 1 | 2 | 3 | 4 | 5;

interface FormState {
  farmName: string;
  farmerName: string;
  location: string;
  cropType: string;
  plantedDate: string;
  harvestDate: string;
  irrigationType: string;
  soilType: string;
}

const EMPTY_FORM: FormState = {
  farmName: "",
  farmerName: "",
  location: "",
  cropType: "Corn",
  plantedDate: "",
  harvestDate: "",
  irrigationType: "Center Pivot",
  soilType: "Loam",
};

const CROP_OPTIONS = ["Corn", "Soy", "Wheat", "Rice", "Cotton", "Other"];
const IRRIGATION_OPTIONS = ["Center Pivot", "Drip", "Sprinkler", "Flood/Furrow", "Rainfed"];
const SOIL_OPTIONS = ["Clay", "Sandy", "Loam", "Silt", "Mixed"];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [polygon, setPolygon] = useState<GeoJSON.Feature<GeoJSON.Polygon> | null>(null);
  const [areaHa, setAreaHa] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [result, setResult] = useState<{ fieldId: string; recommendationsCount: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canNext = (() => {
    if (step === 1) return form.farmName && form.farmerName && form.location;
    if (step === 2) return polygon !== null;
    if (step === 3) return form.plantedDate && form.harvestDate;
    return true;
  })();

  const go = (next: Step) => setStep(next);

  async function runPipeline() {
    setSubmitting(true);
    setError(null);
    try {
      setProgressMsg("Saving field details...");
      const createRes = await fetch(`${API_BASE}/api/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_name: form.farmName,
          field_name: form.farmName,
          farmer_name: form.farmerName,
          location: form.location,
          crop_type: form.cropType,
          planted_date: form.plantedDate,
          harvest_date: form.harvestDate,
          irrigation_type: form.irrigationType,
          soil_type: form.soilType,
          boundary_geojson: polygon,
        }),
      });
      if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(`Create field failed (${createRes.status}): ${text}`);
      }
      const createJson = await createRes.json();
      const fieldId: string = createJson.data.field_id;

      setProgressMsg("Downloading weather data for your field...");
      // brief UI pauses so the farmer sees each step — actual work happens server-side
      await new Promise((r) => setTimeout(r, 400));
      setProgressMsg("Computing crop water balance...");
      await new Promise((r) => setTimeout(r, 400));
      setProgressMsg("Generating recommendations...");

      const runRes = await fetch(`${API_BASE}/api/fields/${fieldId}/run-pipeline`, {
        method: "POST",
      });
      if (!runRes.ok) {
        const text = await runRes.text();
        throw new Error(`Pipeline failed (${runRes.status}): ${text}`);
      }
      const runJson = await runRes.json();
      setResult({
        fieldId,
        recommendationsCount: runJson.recommendations_count ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white shadow-lg">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-400 flex items-center justify-center text-green-900 font-bold text-lg">
              N
            </div>
            <h1 className="text-xl font-bold tracking-tight">Add a Field</h1>
          </div>
          <Link href="/" className="text-sm text-green-200 hover:text-white">
            Cancel
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <StepIndicator current={step} />

        <div className="mt-8 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
          {step === 1 && (
            <Step1 form={form} update={update} />
          )}
          {step === 2 && (
            <Step2
              polygon={polygon}
              areaHa={areaHa}
              onChange={(f, ha) => {
                setPolygon(f);
                setAreaHa(ha);
              }}
            />
          )}
          {step === 3 && <Step3 form={form} update={update} />}
          {step === 4 && (
            <Step4 form={form} polygon={polygon} areaHa={areaHa} />
          )}
          {step === 5 && (
            <Step5
              submitting={submitting}
              progressMsg={progressMsg}
              result={result}
              error={error}
              onStart={runPipeline}
            />
          )}
        </div>

        {step !== 5 && (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => go((step - 1) as Step)}
              disabled={step === 1}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Back
            </button>
            {step < 4 && (
              <button
                type="button"
                onClick={() => go((step + 1) as Step)}
                disabled={!canNext}
                className="px-5 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            )}
            {step === 4 && (
              <button
                type="button"
                onClick={() => go(5)}
                className="px-5 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 transition-colors"
              >
                Looks good — Run Analysis
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const labels = ["Farm", "Field boundary", "Crop", "Confirm", "Analysis"];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {labels.map((label, i) => {
        const step = (i + 1) as Step;
        const active = step === current;
        const done = step < current;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                done
                  ? "bg-green-700 text-white border-green-700"
                  : active
                    ? "bg-white text-green-700 border-green-700"
                    : "bg-white text-gray-400 border-gray-300"
              }`}
            >
              {done ? "✓" : step}
            </div>
            <span
              className={`text-xs font-medium ${
                active ? "text-green-800" : done ? "text-gray-700" : "text-gray-400"
              }`}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <div
                className={`h-0.5 w-6 sm:w-10 ${done ? "bg-green-700" : "bg-gray-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LabelledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent";

function Step1({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Tell us about your farm</h2>
        <p className="text-sm text-gray-500 mt-1">
          We use this to personalise your dashboard and recommendations.
        </p>
      </div>
      <LabelledInput label="Farm / field name">
        <input
          className={INPUT_CLS}
          type="text"
          placeholder="e.g. North 40 — Corn"
          value={form.farmName}
          onChange={(e) => update("farmName", e.target.value)}
        />
      </LabelledInput>
      <LabelledInput label="Your name">
        <input
          className={INPUT_CLS}
          type="text"
          placeholder="Jane Doe"
          value={form.farmerName}
          onChange={(e) => update("farmerName", e.target.value)}
        />
      </LabelledInput>
      <LabelledInput label="Location">
        <input
          className={INPUT_CLS}
          type="text"
          placeholder="e.g. Iowa, USA"
          value={form.location}
          onChange={(e) => update("location", e.target.value)}
        />
      </LabelledInput>
    </div>
  );
}

function Step2({
  polygon,
  areaHa,
  onChange,
}: {
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  areaHa: number;
  onChange: (f: GeoJSON.Feature<GeoJSON.Polygon> | null, ha: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Draw your field boundary</h2>
        <p className="text-sm text-gray-500 mt-1">
          Click on the map to place vertices. Click the first point again to close the shape.
          Use the trash icon to redraw.
        </p>
      </div>
      <OnboardingMap onPolygonChange={onChange} height="500px" />
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
        <span className="text-sm font-medium text-green-900">
          {polygon ? "Boundary captured" : "No boundary drawn yet"}
        </span>
        <span className="text-lg font-bold text-green-800">
          {polygon ? `${areaHa.toFixed(2)} ha` : "— ha"}
        </span>
      </div>
    </div>
  );
}

function Step3({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Crop details</h2>
        <p className="text-sm text-gray-500 mt-1">
          Used for crop-specific water balance and growth-stage recommendations.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <LabelledInput label="Crop type">
          <select
            className={INPUT_CLS}
            value={form.cropType}
            onChange={(e) => update("cropType", e.target.value)}
          >
            {CROP_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </LabelledInput>
        <LabelledInput label="Irrigation type">
          <select
            className={INPUT_CLS}
            value={form.irrigationType}
            onChange={(e) => update("irrigationType", e.target.value)}
          >
            {IRRIGATION_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </LabelledInput>
        <LabelledInput label="Planting date">
          <input
            type="date"
            className={INPUT_CLS}
            value={form.plantedDate}
            onChange={(e) => update("plantedDate", e.target.value)}
          />
        </LabelledInput>
        <LabelledInput label="Expected harvest date">
          <input
            type="date"
            className={INPUT_CLS}
            value={form.harvestDate}
            onChange={(e) => update("harvestDate", e.target.value)}
          />
        </LabelledInput>
        <LabelledInput label="Soil type">
          <select
            className={INPUT_CLS}
            value={form.soilType}
            onChange={(e) => update("soilType", e.target.value)}
          >
            {SOIL_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </LabelledInput>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value || "—"}</span>
    </div>
  );
}

function Step4({
  form,
  polygon,
  areaHa,
}: {
  form: FormState;
  polygon: GeoJSON.Feature<GeoJSON.Polygon> | null;
  areaHa: number;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Confirm your field</h2>
        <p className="text-sm text-gray-500 mt-1">
          Review the details before running the analysis pipeline.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-xl p-5">
          <SummaryRow label="Farm / field" value={form.farmName} />
          <SummaryRow label="Farmer" value={form.farmerName} />
          <SummaryRow label="Location" value={form.location} />
          <SummaryRow label="Crop" value={form.cropType} />
          <SummaryRow label="Planted" value={form.plantedDate} />
          <SummaryRow label="Harvest" value={form.harvestDate} />
          <SummaryRow label="Irrigation" value={form.irrigationType} />
          <SummaryRow label="Soil" value={form.soilType} />
          <SummaryRow label="Area" value={polygon ? `${areaHa.toFixed(2)} ha` : "—"} />
        </div>
        <div>
          {polygon ? (
            <OnboardingMap
              onPolygonChange={() => {}}
              initialPolygon={polygon}
              readOnly
              height="340px"
            />
          ) : (
            <div className="h-[340px] rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
              No boundary drawn.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step5({
  submitting,
  progressMsg,
  result,
  error,
  onStart,
}: {
  submitting: boolean;
  progressMsg: string;
  result: { fieldId: string; recommendationsCount: number } | null;
  error: string | null;
  onStart: () => void;
}) {
  const started = submitting || result !== null || error !== null;

  return (
    <div className="text-center py-8">
      {!started && (
        <>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Ready to analyse</h2>
          <p className="text-sm text-gray-500 mb-6">
            We&apos;ll fetch weather history for your coordinates and compute irrigation
            recommendations. This usually takes under a minute.
          </p>
          <button
            type="button"
            onClick={onStart}
            className="px-6 py-3 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          >
            Start analysis
          </button>
        </>
      )}

      {submitting && (
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-green-200 border-t-green-700 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700">{progressMsg}</p>
        </div>
      )}

      {error && (
        <div className="max-w-lg mx-auto bg-red-50 border border-red-200 rounded-xl p-5 text-left">
          <h3 className="font-semibold text-red-800 mb-1">Analysis failed</h3>
          <p className="text-sm text-red-700 break-words">{error}</p>
          <button
            type="button"
            onClick={onStart}
            className="mt-4 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {result && (
        <div className="max-w-lg mx-auto">
          <div className="h-16 w-16 mx-auto rounded-full bg-green-100 flex items-center justify-center text-3xl mb-4">
            ✓
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Field is live</h2>
          <p className="text-sm text-gray-600 mb-1">
            Generated <strong>{result.recommendationsCount}</strong> irrigation
            recommendation{result.recommendationsCount === 1 ? "" : "s"}.
          </p>
          <p className="text-xs text-gray-400 mb-6">Field ID: {result.fieldId}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-lg bg-green-700 text-white font-semibold hover:bg-green-800 transition-colors"
          >
            View dashboard →
          </Link>
        </div>
      )}
    </div>
  );
}
