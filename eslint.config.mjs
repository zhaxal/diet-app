import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These two rules exist to prepare code for the React Compiler, which this
    // project does not use. The patterns they flag here are deliberate: reading
    // the DOM once after hydration, resetting state when a prop changes, and
    // keeping a "latest value" ref. They stay visible as warnings so the list
    // is ready if the compiler is ever adopted, but they do not fail the run.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  globalIgnores([
    // Defaults of eslint-config-next.
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or third-party output that is not this project's source.
    "public/sw.js",
    "test-results/**",
    "playwright-report/**",
    "scratch/**",
  ]),
]);

export default eslintConfig;
