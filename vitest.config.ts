import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Use the new automatic JSX transform (matches Next.js 15 behaviour) so
  // component files don't need an explicit `import React from "react"` to
  // render in tests. Without this, esbuild defaults to the classic transform
  // which calls React.createElement and requires React in scope.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Type-only files and generated/declaration code.
        "src/**/*.d.ts",
        "src/types/**",
        // Constants tables (large data files, not testable logic).
        "src/constants/**",
        // Next.js framework boilerplate (layouts, error boundaries, loaders).
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        "src/app/**/page.tsx",
        // shadcn-generated primitives (re-exports of Radix UI).
        "src/components/ui/**",
        // Components: covered by Playwright + visual regression, not vitest.
        "src/components/**",
        // Server actions and middleware-level glue tested via integration/e2e.
        "src/middleware.ts",
      ],
      // Tiered thresholds. Logic modules carry strict gates because regressions
      // there are silent; API routes and lower layers rely on integration /
      // e2e tests for the rest of their assurance. Excluded areas above are
      // not measured at all to keep this signal meaningful.
      thresholds: {
        // Global floor.
        lines: 70,
        branches: 60,
        functions: 70,
        statements: 70,
        // Pure-logic modules — high bar.
        "src/lib/auth/**": { lines: 90, branches: 80, functions: 90, statements: 90 },
        "src/lib/security/**": { lines: 90, branches: 80, functions: 90, statements: 90 },
        "src/lib/assessment/**": { lines: 80, branches: 70, functions: 80, statements: 80 },
        "src/lib/commercial/**": { lines: 85, branches: 75, functions: 85, statements: 85 },
        "src/lib/conversation/**": { lines: 80, branches: 70, functions: 80, statements: 80 },
        "src/lib/lifecycle/**": { lines: 80, branches: 70, functions: 80, statements: 80 },
        // DB query helpers — paired with integration tests.
        "src/lib/db/**": { lines: 70, branches: 60, functions: 70, statements: 70 },
        // API routes — coverage less informative; integration/e2e fill the gap.
        "src/app/api/**": { lines: 65, branches: 55, functions: 65, statements: 65 },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
