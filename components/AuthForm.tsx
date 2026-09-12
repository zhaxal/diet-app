"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) {
        await api.login(email, password);
      } else {
        await api.register(email, password);
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
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-dim">
            Diet Tracker // {isLogin ? "Auth" : "Register"}
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
              : "Track food here and through your assistant in one daily record."}
          </p>

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
