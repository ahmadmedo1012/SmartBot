// fb_dashboard/frontend/eslint.config.mjs — r133 (A5 S6): family adoption,
// the SO r126 re-arm ladder (error-level TS + Core-Web-Vitals, e2e/tests
// carve-out for the Playwright battery, ignores for build outputs).
// src was verified clean at error level this round: 0 `any`,
// console.error-only, no-img-element/no-non-null-assertion disables in place.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/prefer-as-const": "error",
      "react-hooks/exhaustive-deps": "error",
      /* r133: the two React-Compiler-era rules below ship with the v6 plugin
         bundled in eslint-config-next 16.3.8 — the SO/SM family ladder
         (eslint-config-next 16.1.x) does not run them. They flag legitimate
         mount-sync patterns across ~30 sites (matchMedia reads, one-time
         hydration effects). TODO(fleet): adopt in a dedicated round with the
         family, not as a drive-by of the SB adoption. */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react/no-unescaped-entities": "error",
      "@next/next/no-img-element": "error",
      "@next/next/no-html-link-for-pages": "error",
      "prefer-const": "error",
      "no-console": ["error", { allow: ["error", "warn"] }],
      "no-debugger": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Playwright battery: console + loosely-typed Graph payloads.
    files: ["e2e/**/*.{mjs,ts}", "tests/**/*.mjs"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // src/app/layout.tsx links /fonts/fonts.css manually on purpose —
    // preload + unicode-range arabic subsets; the Next CSS pipeline would
    // reorder it (the SO r126 file-scope carve-out, same pattern).
    files: ["src/app/layout.tsx"],
    rules: { "@next/next/no-css-tags": "off" },
  },
  {
    /* r133 (G4): no-location-assign-relative-destination ships with
       eslint-config-next 16.3 (the SO/SM family ladder at 16.1 does not
       run it). Every hit is a DELIBERATE MPA hard navigation that must
       clear client state: AuthGuard's 401/user eviction to /login
       (AuthGuard.tsx:73,77,80), the [...slug] fallback
       (window.location.assign("/dashboard")), and the payment dialog's
       post-approve/cancel exits (payment/index.tsx:375,542). A soft
       router.push would leave stale auth/payment state behind. */
    rules: { "@next/next/no-location-assign-relative-destination": "off" },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
];
export default eslintConfig;
