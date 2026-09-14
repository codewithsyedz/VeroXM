"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { Chrome, Eye, EyeOff, Grid3x3, KeyRound, Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";

// Slice 1 (docs/IDENTITY-PLATFORM-RECOMMENDATION.md §7): only rendered
// when the server actually configured a Keycloak provider (see
// keycloakProvider() in src/lib/auth.ts) — invisible until Keycloak is set
// up locally. The Credentials form below is always present and untouched
// functionally; this redesign only restyles it and reorders Keycloak
// above it as the primary CTA, per the new design brief.
const keycloakEnabled = process.env.NEXT_PUBLIC_KEYCLOAK_ENABLED === "true";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setSubmitting(false);
    if (res?.error) {
      setError("Incorrect email or password.");
      return;
    }
    window.location.href = "/projects";
  }

  return (
    <AuthShell
      eyebrow="SIGN IN"
      title="Welcome back."
      description="Sign in to continue to your VeroXM workspace."
    >
      {keycloakEnabled && (
        <>
          <button
            type="button"
            onClick={() => signIn("keycloak", { callbackUrl: "/projects" })}
            className="button-primary w-full"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Sign in with Keycloak
          </button>
          <p className="mt-2 text-center text-[11px] text-[#7680a3]">
            Use your organization&rsquo;s secure identity provider
          </p>

          {/* Google / SSO: not wired up yet (only Credentials + Keycloak
              auth exist today) — shown per the design brief but disabled
              rather than implying they work. */}
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              disabled
              className="button-secondary w-full"
              title="Not available yet"
            >
              <Chrome className="h-4 w-4" aria-hidden="true" />
              Continue with Google
            </button>
            <button
              type="button"
              disabled
              className="icon-button border border-white/10"
              aria-label="More sign-in options (not available yet)"
              title="Not available yet"
            >
              <Grid3x3 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="my-6 flex items-center gap-3 text-[10px] font-mono-code uppercase tracking-[0.08em] text-[#7680a3]">
            <span className="h-px flex-1 bg-white/[0.08]" />
            Or use your email
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="block text-[12px] font-medium text-[#b8bfd8]">
          Email
          <div className="relative mt-1.5">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7680a3]"
              aria-hidden="true"
            />
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-quiet px-9 py-2.5 text-[14px] text-[#f2f3fb]"
            />
          </div>
        </label>
        <label className="block text-[12px] font-medium text-[#b8bfd8]">
          Password
          <div className="relative mt-1.5">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7680a3]"
              aria-hidden="true"
            />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-quiet px-9 py-2.5 text-[14px] text-[#f2f3fb]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7680a3] hover:text-[#f2f3fb]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </label>
        <button type="submit" disabled={submitting} className="button-primary mt-2 w-full">
          {submitting ? "Logging in…" : "Log in"}
        </button>
        {error && <p className="text-[13px] text-red-400">{error}</p>}
      </form>

      <p className="mt-6 text-center text-[13px] text-[#7680a3]">
        Don&rsquo;t have an account?{" "}
        <Link href="/register" className="font-medium text-[#8ea0ff] hover:text-[#b8bfd8]">
          Create workspace
        </Link>
      </p>
    </AuthShell>
  );
}
