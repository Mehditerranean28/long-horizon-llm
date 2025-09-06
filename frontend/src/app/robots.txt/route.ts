export function GET() {
  const body = `# robots.txt for Sovereign Reasoning System
User-agent: *
Allow: /

# Block API routes
Disallow: /api/

Sitemap: /sitemap.xml
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=UTF-8',
    },
  });
}
