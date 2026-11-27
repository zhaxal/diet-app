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
  ).catch((err) => {
    bundle = null;
    throw err;
  });

  return new Response(new Uint8Array(await bundle), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
