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
        "src/**/*.d.ts",
        "src/**/types.ts",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        "src/components/ui/**",
      ],
      // Target: raise to 80%+ as test coverage expands
      thresholds: {
        lines: 35,
        branches: 25,
        functions: 35,
        statements: 35,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
