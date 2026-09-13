import { ApiReference } from "@scalar/nextjs-api-reference";

// Renders an interactive API reference (Scalar) for the OpenAPI spec served
// at /api/openapi.json. Visit /api-docs in the browser.
export const GET = ApiReference({
  spec: { url: "/api/openapi.json" },
  metaData: { title: "rationd API Reference" },
  // The reference used to pull `@latest` from jsDelivr at runtime. Serve the
  // pinned browser bundle from this deployment so the self-hosted app remains
  // deterministic and works without public internet access.
  cdn: "/api-docs/scalar.js",
  customCss: `
    html,
    body {
      max-width: 100%;
      overflow-x: clip;
    }
    button:focus-visible,
    a:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
    @media (pointer: coarse), (max-width: 480px) {
      button,
      input,
      select,
      textarea,
      a.endpoint,
      a.open-api-client-button {
        min-height: 44px !important;
      }
      button,
      .scalar-icon-button {
        min-width: 44px !important;
      }
    }
  `,
});
