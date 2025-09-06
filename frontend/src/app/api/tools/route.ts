import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const data = await request.json();
  console.log('Tool invoked', data.tool, 'for query', data.query);
  return NextResponse.json({ message: `Executed ${data.tool}` });
}
