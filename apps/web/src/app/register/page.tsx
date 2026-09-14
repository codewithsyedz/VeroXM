"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Chrome, Eye, EyeOff, Grid3x3, KeyRound, Lock, Mail, User } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";

const keycloakEnabled = process.env.NEXT_PUBLIC_KEYCLOAK_ENABLED === "true";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);

  return (
    <AuthShell
      eyebrow="CREATE YOUR WORKSPACE"
      title="Start with clarity."
      description="Create a VeroXM workspace to bring your content, team, and channels together."
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

      {/* Self-serve workspace creation has no backend yet — there is no
          /register (or equivalent) endpoint in apps/api today; accounts
          come from Keycloak Organizations or the legacy dataset. This form
          is shown for visual parity with the design brief, but the submit
          stays disabled with an explanation rather than pretending to
          create an account that doesn't get created. */}
      <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <label className="block text-[12px] font-medium text-[#b8bfd8]">
          Full name
          <div className="relative mt-1.5">
            <User
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7680a3]"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-quiet px-9 py-2.5 text-[14px] text-[#f2f3fb]"
            />
          </div>
        </label>
        <label className="block text-[12px] font-medium text-[#b8bfd8]">
          Work email
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
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

        <label className="mt-1 flex items-start gap-2 text-[12px] text-[#7680a3]">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-transparent"
          />
          <span>
            I agree to the <span className="text-[#8ea0ff]">Terms</span> and{" "}
            <span className="text-[#8ea0ff]">Privacy Policy</span>
          </span>
        </label>

        <button
          type="submit"
          disabled
          title="Self-serve workspace creation isn't available yet"
          className="button-primary mt-2 w-full"
        >
          Create workspace
        </button>
        <p className="text-center text-[12px] text-[#7680a3]">
          Self-serve signup isn&rsquo;t available yet — sign in with Keycloak
          above, or ask an admin to create your account.
        </p>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#7680a3]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#8ea0ff] hover:text-[#b8bfd8]">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
