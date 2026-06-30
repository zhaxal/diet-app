import { ApiReference } from "@scalar/nextjs-api-reference";

// Renders an interactive API reference (Scalar) for the OpenAPI spec served
// at /api/openapi.json. Visit /api-docs in the browser.
export const GET = ApiReference({
  spec: { url: "/api/openapi.json" },
  metaData: { title: "Diet Tracker API Reference" },
});
