import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Allow console in logger files that legitimately need it
    files: ["src/lib/logger.ts", "src/lib/suppress-console.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    rules: {
      // Warn on console usage - use logger from @/lib/logger instead
      "no-console": "warn",
      // Allow unescaped entities in JSX (quotes, apostrophes etc.)
      "react/no-unescaped-entities": "off",
      // Warn on explicit any instead of erroring (prevents build failures)
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow underscore-prefixed variables to be unused (common convention for intentionally unused params)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
