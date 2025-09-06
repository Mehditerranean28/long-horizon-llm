export async function checkBackendConnectivity(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SOVEREIGN_API_URL || '';
  if (!base) return false;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}
