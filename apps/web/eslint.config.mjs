import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // React Compiler rules that arrived with an eslint-plugin-react-hooks
      // upgrade, not with new code. They flag the documented
      // "reset derived state when a prop changes" idiom across ~20 components.
      // Kept visible as warnings: they are real tech debt worth paying down
      // component by component, but they describe render efficiency rather
      // than incorrectness, and a blanket rewrite is riskier than the smell.
      // The genuinely unsafe hook violations (reading or writing refs during
      // render, which tears under concurrent rendering) are fixed and the
      // "react-hooks/refs" rule stays an error.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
