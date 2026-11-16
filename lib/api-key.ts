import { randomBytes } from "crypto";

/**
 * A fresh API key: 128 random bits as hex.
 *
 * The schema's own default for the column is `cuid()`, which is an identifier
 * format — partly a timestamp and a counter — rather than a secret. Every code
 * path that creates or rotates a key goes through here instead.
 */
export function generateApiKey(): string {
  return randomBytes(16).toString("hex");
}
