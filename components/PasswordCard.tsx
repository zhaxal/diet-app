"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useToast } from "./Toast";

/**
 * Change the signed-in account's password.
 *
 * The server ends every other session when this succeeds and hands this
 * browser a fresh one through its cookie, so nothing here needs to reload.
 */
export default function PasswordCard({ email }: { email: string }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      toast("Password changed — other devices signed out", "info");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {/* Not shown, but it tells a password manager which login to update. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />
      <div className="grid gap-3 min-[560px]:grid-cols-2">
        <div>
          <label
            htmlFor="current-password"
            className="block text-2xs uppercase tracking-wider text-ink-faint"
          >
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="field mt-1 w-full"
          />
        </div>
        <div>
          <label
            htmlFor="new-password"
            className="block text-2xs uppercase tracking-wider text-ink-faint"
          >
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="field mt-1 w-full"
            placeholder="At least 8 characters"
          />
        </div>
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

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-2xs text-ink-faint">
          Signs out your other devices. The assistant connector keeps working.
        </p>
        <button type="submit" disabled={saving} className="motion-press btn btn-primary shrink-0">
          {saving ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
