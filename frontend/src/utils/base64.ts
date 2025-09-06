// Utility for base64 encoding without relying on the Node Buffer API.
// Next.js client bundles no longer polyfill Buffer by default, so we
// implement a small helper that works in both browser and Node runtimes.

/**
 * Convert an ArrayBuffer to a base64 encoded string.
 * @param buffer Binary data to encode.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Use btoa in the browser and fall back to Buffer when available (tests/node).
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  const B = (globalThis as any).Buffer;
  return B.from(binary, 'binary').toString('base64');
}

