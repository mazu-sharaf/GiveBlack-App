const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Long legal/settings copy uses quotes and apostrophes; escaping hurts readability in RN Text.
      "react/no-unescaped-entities": "off",
    },
  },
]);
