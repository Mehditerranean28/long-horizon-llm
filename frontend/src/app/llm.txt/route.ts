export function GET() {
  const body = `Sovereign Reasoning System\n--------------------------\nThis website hosts the Sovereign Reasoning System, a platform that orchestrates long-horizon tasks using deterministic reasoning.\nIt offers a business portal at /business and interactive chat experiences.\nPublic APIs are available under /api for authenticated users.\nAutomated agents may read /api/notifications for real-time updates.\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
    },
  });
}
