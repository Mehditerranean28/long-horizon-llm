export const MAX_FILENAME_CHAR_LENGTH = 255;
export const MAX_DATA_URI_LENGTH_CHARS = 67_108_864; // ~64 million chars (~50MB base64)

export const ALLOWED_MIME_TYPES: Set<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/zip',
  'text/plain',
  'application/json',
  'application/xml',
]);

export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const MIME_TYPE_REGEX = /^[a-z0-9]+(?:\.[a-z0-9]+)*\/[a-z0-9.+-]+$/i;
export const DATA_URI_REGEX = /^data:([a-z]+\/[a-z0-9.+-]+(?:;[a-z0-9.-]+=[a-z0-9.-]+)*);base64,([A-Za-z0-9+/=_-]+)$/i;
