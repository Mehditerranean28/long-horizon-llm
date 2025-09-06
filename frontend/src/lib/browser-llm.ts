let worker: Worker | null = null;

export async function queryBrowserLLM(query: string): Promise<string> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }

  return new Promise((resolve) => {
    const handleMessage = (e: MessageEvent<any>) => {
      if (e.data.status === 'complete') {
        worker?.removeEventListener('message', handleMessage);
        const text = e.data.output[0]?.generated_text || '';
        resolve(text.trim());
      }
    };
    worker!.addEventListener('message', handleMessage);
    worker!.postMessage({ text: query });
  });
}
