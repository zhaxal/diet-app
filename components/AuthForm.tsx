"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Null until the server has answered. The form is shown meanwhile: the
  // server enforces the rule either way, this only decides what to ask for.
  const [registration, setRegistration] = useState<{
    open: boolean;
    inviteRequired: boolean;
  } | null>(null);

  const isLogin = mode === "login";
  const closed = !isLogin && registration?.open === false;
  const needsInvite = !isLogin && registration?.inviteRequired === true;

  useEffect(() => {
    if (isLogin) return;
    let cancelled = false;
    api
      .registrationStatus()
      .then((state) => {
        if (!cancelled) setRegistration(state);
      })
      .catch(() => {
        // Unreachable server: leave the plain form up and let submit report it.
      });
    return () => {
      cancelled = true;
    };
  }, [isLogin]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) {
        await api.login(email, password);
      } else {
        await api.register(email, password, needsInvite ? inviteCode : undefined);
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isLogin
            ? "Authentication failed. Please verify your credentials and try again."
            : "Account creation failed. Please check your information and try again.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-safe items-center justify-center p-3">
      <div className="motion-day-surface panel w-full max-w-sm overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-3 py-1.5"
          style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
        >
          <span className="text-2xs font-semibold tracking-wider text-ink-dim">
            rationd // {isLogin ? "Auth" : "Register"}
          </span>
          <span className="num text-2xs text-ink-faint">system</span>
        </div>

        <div className="p-4">
          <h1 className="text-xs font-semibold uppercase tracking-widest text-ink">
            {isLogin ? "Session Login" : "Create Account"}
          </h1>
          <p className="mt-1 text-xs text-ink-dim">
            {isLogin
              ? "Review your day or keep logging."
              : closed
                ? "This server is not taking new accounts."
                : "Track food here and through your assistant in one daily record."}
          </p>

          {closed ? (
            <p
              role="status"
              className="motion-state-enter mt-4 rounded px-2.5 py-1.5 text-xs text-ink-dim"
              style={{ background: "var(--panel-2)", border: "1px solid var(--line)" }}
            >
              Ask whoever runs it for an invite code.
            </p>
          ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="email"
                className="block text-2xs uppercase tracking-wider text-ink-faint"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field mt-1 w-full"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-2xs uppercase tracking-wider text-ink-faint"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field mt-1 w-full"
                placeholder="At least 8 characters"
              />
            </div>
            {needsInvite && (
              <div className="motion-state-enter">
                <label
                  htmlFor="invite-code"
                  className="block text-2xs uppercase tracking-wider text-ink-faint"
                >
                  Invite code
                </label>
                <input
                  id="invite-code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="field mt-1 w-full"
                  placeholder="From the server's owner"
                />
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="motion-state-enter rounded px-2.5 py-1.5 text-xs"
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--over)",
                  color: "var(--over)",
                }}
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="motion-press btn btn-primary w-full"
            >
              {loading
                ? "Please wait…"
                : isLogin
                  ? "Log in"
                  : "Create account"}
            </button>
          </form>
          )}

          <div
            className="mt-4 border-t pt-3 text-center text-xs text-ink-dim"
            style={{ borderColor: "var(--line)" }}
          >
            {isLogin ? (
              <>
                No account?{" "}
                <Link href="/register" className="-mx-1.5 px-1.5 text-accent hover:underline">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="-mx-1.5 px-1.5 text-accent hover:underline">
                  Log in
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
