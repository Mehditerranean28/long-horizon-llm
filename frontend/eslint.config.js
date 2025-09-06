const { FlatCompat } = require('@eslint/eslintrc');
const compat = new FlatCompat();
module.exports = [
  {
    ignores: ['LLM_tracer/**/*', 'tests/k6/**/*', '.next/**/*'],
  },
  ...compat.config({
    extends: ['next/core-web-vitals'],
    rules: {
      'import/no-anonymous-default-export': 'off',
    },
  }),
];
