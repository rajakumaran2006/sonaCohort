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
    },
  },
];

export default eslintConfig;
