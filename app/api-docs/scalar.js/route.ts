import { readFile } from "node:fs/promises";
import { join } from "node:path";

let bundle: Promise<Buffer> | null = null;

export async function GET() {
  bundle ??= readFile(
    join(
      process.cwd(),
      "node_modules",
      "@scalar",
      "api-reference",
      "dist",
      "browser",
      "standalone.js",
    ),
  );

  return new Response(new Uint8Array(await bundle), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
