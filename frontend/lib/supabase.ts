import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * True once real Supabase keys have been pasted into .env.local.
 * While false, the UI renders but every auth call would fail —
 * components should guard with this.
 */
export const supabaseConfigured =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  SUPABASE_URL !== "your_url_here" &&
  SUPABASE_ANON_KEY !== "your_anon_key_here";

export const supabase = createBrowserClient(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY ?? "placeholder-anon-key"
);
