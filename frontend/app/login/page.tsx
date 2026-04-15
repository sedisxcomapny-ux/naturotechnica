"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type Tab = "signin" | "signup" | "forgot";

const INPUT_CLS =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("signin");

  // Shared form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [farmName, setFarmName] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function reset() {
    setError(null);
    setNotice(null);
  }

  function requireSupabase(): boolean {
    if (!supabaseConfigured) {
      setError(
        "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to frontend/.env.local and restart the dev server."
      );
      return false;
    }
    return true;
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!requireSupabase()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!requireSupabase()) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, farm_name: farmName },
        },
      });
      if (error) throw error;
      setNotice("Check your email to confirm your account.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!requireSupabase()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setNotice("Reset link sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    reset();
    if (!requireSupabase()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-green-700 flex items-center justify-center text-white font-bold text-xl">
              N
            </div>
            <h1 className="text-2xl font-bold text-green-800 tracking-tight">
              Naturotechnica
            </h1>
          </div>
          <p className="text-sm text-gray-500">
            Agricultural intelligence for modern farms
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          {/* Tabs */}
          {tab !== "forgot" && (
            <div className="flex border-b border-gray-200 mb-6">
              <TabButton active={tab === "signin"} onClick={() => { setTab("signin"); reset(); }}>
                Sign in
              </TabButton>
              <TabButton active={tab === "signup"} onClick={() => { setTab("signup"); reset(); }}>
                Create account
              </TabButton>
            </div>
          )}

          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}

          {tab === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className={INPUT_CLS}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  className={INPUT_CLS}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <PrimaryButton busy={busy} type="submit">Sign in</PrimaryButton>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setTab("forgot"); reset(); }}
                  className="text-xs text-green-700 hover:text-green-900 font-medium"
                >
                  Forgot password?
                </button>
              </div>

              <Divider>or continue with</Divider>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </form>
          )}

          {tab === "signup" && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <Field label="Full name">
                <input
                  type="text"
                  required
                  className={INPUT_CLS}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className={INPUT_CLS}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password" hint="At least 8 characters">
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className={INPUT_CLS}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Farm name">
                <input
                  type="text"
                  required
                  className={INPUT_CLS}
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                />
              </Field>
              <PrimaryButton busy={busy} type="submit">Create account</PrimaryButton>
            </form>
          )}

          {tab === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-gray-900">Reset your password</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enter your email and we&apos;ll send a reset link.
                </p>
              </div>
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  className={INPUT_CLS}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <PrimaryButton busy={busy} type="submit">Send reset link</PrimaryButton>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setTab("signin"); reset(); }}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  ← Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>

        {!supabaseConfigured && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 text-center">
            Supabase keys not set. Paste real keys into frontend/.env.local to enable auth.
          </p>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
        active
          ? "text-green-800 border-green-700"
          : "text-gray-500 border-transparent hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-400 mt-1 block">{hint}</span>}
    </label>
  );
}

function PrimaryButton({
  busy,
  type,
  children,
}: {
  busy: boolean;
  type: "submit" | "button";
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={busy}
      className="w-full rounded-lg bg-green-700 text-white py-2.5 text-sm font-semibold hover:bg-green-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
    >
      {busy && (
        <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative my-2">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-200" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-white px-2 text-gray-400 uppercase tracking-wider">{children}</span>
      </div>
    </div>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-green-50 border-green-200 text-green-800";
  return (
    <div className={`border rounded-lg p-3 text-sm mb-4 ${cls}`}>{children}</div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.75h3.57c2.09-1.92 3.27-4.75 3.27-8.08z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.67l-3.57-2.75c-.99.67-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

