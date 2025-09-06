// Re-export the canonical API_BASE_URL defined in TypeScript constants to avoid
// divergence between CommonJS and ESM consumers.
// The `.ts` extension is used explicitly so Node can resolve the file without a
// build step when running server-side utilities.
const { API_BASE_URL } = require('../constants/api-base.ts');

module.exports = { API_BASE_URL };
