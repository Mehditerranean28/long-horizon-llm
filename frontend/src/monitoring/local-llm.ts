export async function checkLocalLlmConnectivity(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_LOCAL_LLM_URL || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    clearTimeout(id);
    return res.ok;
  } catch {
    return false;
  }
}
