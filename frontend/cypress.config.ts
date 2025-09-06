import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:9002',
    supportFile: 'cypress/support/e2e.ts',
  },
});
