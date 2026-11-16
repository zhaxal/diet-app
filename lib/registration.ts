// Who may create an account on this server.
//
// The app is personal first and "a handful of invited people later" (see
// PRODUCT.md), so an open sign-up form on a public URL is the wrong default.
// The rule is:
//
//   - no accounts yet      → open, so a fresh install can be set up
//   - INVITE_CODE is set   → open to anyone who supplies that code
//   - otherwise            → closed
//
// INVITE_CODE is read on every call rather than once at start-up, which keeps
// the rule testable and means there is no cached answer to go stale.

import { timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

export interface RegistrationState {
  /** Whether an account can be created at all right now. */
  open: boolean;
  /** Whether creating one requires the invite code. */
  inviteRequired: boolean;
}

function configuredInviteCode(): string | null {
  const code = process.env.INVITE_CODE?.trim();
  return code ? code : null;
}

export async function registrationState(): Promise<RegistrationState> {
  if ((await prisma.user.count()) === 0) return { open: true, inviteRequired: false };
  if (configuredInviteCode()) return { open: true, inviteRequired: true };
  return { open: false, inviteRequired: false };
}

/** Constant-time comparison against the configured code. */
export function inviteCodeMatches(given: unknown): boolean {
  const expected = configuredInviteCode();
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
