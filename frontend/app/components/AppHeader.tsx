"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const NAV = [
  { label: "Dashboard", href: "/" },
  { label: "Fields", href: "/onboarding" },
  { label: "Weather", href: "/weather" },
  { label: "Settings", href: "/settings" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      if (supabaseConfigured) await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
      setOpen(false);
      router.push("/login");
      router.refresh();
    }
  }

  const initial = email ? email.charAt(0).toUpperCase() : "?";
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="bg-green-800 text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-green-400 flex items-center justify-center text-green-900 font-bold text-lg">
            N
          </div>
          <h1 className="text-xl font-bold tracking-tight">Naturotechnica</h1>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <nav className="flex gap-4 sm:gap-6 text-sm font-medium text-green-200">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={
                  isActive(n.href) ? "text-white" : "hover:text-white transition-colors"
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>

          {/* Avatar + dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Account menu"
              className="h-9 w-9 rounded-full bg-green-400 text-green-900 font-bold text-sm flex items-center justify-center hover:bg-green-300 transition-colors"
            >
              {initial}
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50">
                <div className="px-4 py-2.5 text-xs text-gray-500 truncate" title={email ?? ""}>
                  {email ?? "Not signed in"}
                </div>
                <div className="border-t border-gray-100" />
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Settings
                </Link>
                <div className="border-t border-gray-100" />
                <button
                  type="button"
                  onClick={signOut}
                  disabled={signingOut}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
                >
                  {signingOut && (
                    <span className="h-3 w-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  )}
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
