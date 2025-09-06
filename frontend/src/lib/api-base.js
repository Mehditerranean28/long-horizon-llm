const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_SOVEREIGN_API_URL ||
  '/api';

module.exports = { API_BASE_URL };
