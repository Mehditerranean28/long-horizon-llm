const rawApiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '/api';

// Normalize to avoid trailing slashes which could lead to malformed URLs
export const API_BASE_URL = rawApiBase.replace(/\/$/, '');
