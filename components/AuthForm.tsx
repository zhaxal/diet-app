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
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-safe items-center justify-center p-3">
      <div className="panel w-full max-w-sm p-3">
        <h1 className="text-sm font-semibold uppercase tracking-widest text-ink">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-xs text-ink-dim">
          {isLogin
            ? "Review your day or keep logging."
            : "Track food here and through your assistant in one daily record."}
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-2">
          <div>
            <label
              htmlFor="email"
              className="block text-2xs font-semibold uppercase tracking-wider text-ink-dim"
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
              className="block text-2xs font-semibold uppercase tracking-wider text-ink-dim"
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
              className="rounded px-2 py-1.5 text-xs"
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
            className="btn btn-primary w-full"
          >
            {loading
              ? "Please wait…"
              : isLogin
                ? "Log in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-dim">
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
        </p>
      </div>
    </main>
  );
}
