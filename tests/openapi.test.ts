import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { buildOpenApiDocument } from "../lib/openapi";
import { resolvePublicOrigin } from "../lib/origin";

const SKIP_SEGMENTS = new Set(["mcp", "openapi.json", "api-docs"]);
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function collectApiRoutes(dir: string, segments: string[] = []): Array<{ path: string; methods: string[] }> {
  const out: Array<{ path: string; methods: string[] }> = [];
  for (const entry of readdirSync(dir)) {
    if (segments.length === 0 && SKIP_SEGMENTS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectApiRoutes(full, [...segments, entry]));
    } else if (entry === "route.ts") {
      const openApiPath =
        "/" +
        segments
          .map((seg) => (seg.startsWith("[") && seg.endsWith("]") ? `{${seg.slice(1, -1)}}` : seg))
          .join("/");
      const src = readFileSync(full, "utf8");
      const methods = HTTP_METHODS.filter((m) =>
        new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(src),
      ).map((m) => m.toLowerCase());
      out.push({ path: openApiPath, methods });
    }
  }
  return out;
}

test("buildOpenApiDocument covers every REST route and HTTP method in app/api", () => {
  const spec = buildOpenApiDocument("https://example.test");
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const routes = collectApiRoutes(join(process.cwd(), "app", "api"));

  assert.ok(routes.length > 0);
  for (const r of routes) {
    assert.ok(paths[r.path], `Missing OpenAPI path entry for ${r.path}`);
    for (const method of r.methods) {
      assert.ok(
        paths[r.path][method],
        `Missing OpenAPI operation ${method.toUpperCase()} ${r.path}`,
      );
    }
  }
});

test("resolvePublicOrigin validates forwarded scheme and host headers", () => {
  const prevOrigin = process.env.PUBLIC_ORIGIN;
  delete process.env.PUBLIC_ORIGIN;
  try {
    const valid = new NextRequest("http://127.0.0.1:3000/api/openapi.json", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "diet.example.com:8443",
      },
    });
    assert.equal(resolvePublicOrigin(valid), "https://diet.example.com:8443");

    const badScheme = new NextRequest("http://127.0.0.1:3000/api/openapi.json", {
      headers: {
        "x-forwarded-proto": "javascript",
        "x-forwarded-host": "diet.example.com",
      },
    });
    assert.equal(resolvePublicOrigin(badScheme), badScheme.nextUrl.origin);

    for (const badHost of ["evil.com/path", "evil.com@good.com", "bad host"]) {
      const req = new NextRequest("http://127.0.0.1:3000/api/openapi.json", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": badHost,
        },
      });
      assert.equal(resolvePublicOrigin(req), req.nextUrl.origin);
    }
  } finally {
    if (prevOrigin !== undefined) process.env.PUBLIC_ORIGIN = prevOrigin;
  }
});
