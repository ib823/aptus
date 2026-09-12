import { dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  // Next owns these plugins. Resolve from its package under pnpm's isolated
  // layout rather than relying on hoisting or a machine-specific NODE_PATH.
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next")),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["tests/**/*.ts", "tests/**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.ts", "scripts/**/*.mjs", "scripts/**/*.js", "prisma/**/*.ts"],
    rules: {
      "no-console": "off",
      // Browser-targeted rule; scripts/ are Node CLI tools where `module` is a legit name.
      "@next/next/no-assign-module-variable": "off",
      // Most scripts are one-shot ops/backfill jobs; tolerate dead constants.
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
    },
  },
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  /*
   * THE CoreEdge CONSOLE MAY NOT WRITE A COLOUR OR A LENGTH BY HAND.
   *
   * The audit counted 239 raw hex values across 41 component files, 27 rgb()
   * calls and 1343 px literals, and found the existing console screens styling
   * themselves with inline `style={{…}}` objects rather than classes — which is
   * why the responsive pass has to use `!important` on every rule
   * (app/(studio)/studio-responsive.css). None of that is in scope to fix; the
   * point of this rule is that the NEW surface does not join it.
   *
   * SCOPED TO THE NEW DIRECTORIES ONLY. Running this over the whole repo would
   * produce ~1600 errors on code this work does not touch, and a rule that
   * cannot be satisfied is a rule everyone learns to disable.
   *
   * WHY no-restricted-syntax AND NOT A STYLELINT PASS. These values live in
   * TypeScript — style objects, class strings, template literals — not in .css
   * files, so a CSS linter would not see them. The selectors below match the
   * literal nodes themselves, which is where the value actually is.
   *
   * WHAT IT CANNOT CATCH, said plainly so nobody trusts it further than it goes:
   * a UNITLESS number in a React style object (`fontSize: 11.5`) is rendered as
   * px by React and is invisible to a string-literal rule. The design-system
   * page (PR-3) is what covers that, by rendering every component in every state
   * against the token scale.
   */
  {
    /* Patterns listed one extension at a time, never `*.{ts,tsx}`. This repo's
     * pnpm overrides pin `brace-expansion` to >=5, whose API minimatch@3 (which
     * @eslint/config-array still uses) cannot call — a braced pattern crashes
     * the whole lint run with "expand is not a function" rather than simply not
     * matching. Every other block in this file already lists patterns
     * separately for the same reason. */
    files: [
      "src/components/coreedge/**/*.ts",
      "src/components/coreedge/**/*.tsx",
      "src/app/(coreedge)/**/*.ts",
      "src/app/(coreedge)/**/*.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?![0-9a-fA-F])/]",
          message:
            "Raw hex colour. CoreEdge colours come from the token scope — use a Tailwind utility (bg-gate-ok-bg, text-ink-muted) or var(--token). See src/app/coreedge-tokens.css.",
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?![0-9a-fA-F])/]",
          message:
            "Raw hex colour in a template literal. CoreEdge colours come from the token scope — see src/app/coreedge-tokens.css.",
        },
        {
          selector: "Literal[value=/\\brgba?\\(/]",
          message:
            "Raw rgb()/rgba(). The only alpha values CoreEdge declares are --rail-hover and --rail-active, and they are tokens. See src/app/coreedge-tokens.css.",
        },
        {
          selector: "TemplateElement[value.raw=/\\brgba?\\(/]",
          message:
            "Raw rgb()/rgba() in a template literal. See src/app/coreedge-tokens.css.",
        },
        {
          selector: "Literal[value=/\\b\\d+(?:\\.\\d+)?px\\b/]",
          message:
            "Raw px literal. CoreEdge lengths come from the --space-*, --radius-*, --text-* and layout scales; a 1px hairline comes from Tailwind's `border` utility, not from a string. See src/app/coreedge-tokens.css.",
        },
        {
          selector: "TemplateElement[value.raw=/\\b\\d+(?:\\.\\d+)?px\\b/]",
          message:
            "Raw px literal in a template literal. See src/app/coreedge-tokens.css.",
        },
      ],
    },
  },
];

export default eslintConfig;
