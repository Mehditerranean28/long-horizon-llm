import { NextResponse } from 'next/server';
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';

interface Session {
  id: string;
  title: string;
  dateCategory: string;
}

const dataFile = join(process.cwd(), 'data', 'sessions.json');

async function loadSessions(): Promise<Session[]> {
  try {
    const data = await readFile(dataFile, 'utf8');
    return JSON.parse(data) as Session[];
  } catch {
    return [];
  }
}

async function saveSessions(sessions: Session[]): Promise<void> {
  await writeFile(dataFile, JSON.stringify(sessions, null, 2));
}

export async function GET() {
  const sessions = await loadSessions();
  return NextResponse.json(sessions);
}

export async function POST(request: Request) {
  const data = await request.json();
  const sessions = await loadSessions();

  if (data.action === 'rename') {
    const session = sessions.find(s => s.id === data.id);
    if (session) session.title = data.title;
  } else if (data.action === 'archive') {
    const index = sessions.findIndex(s => s.id === data.id);
    if (index !== -1) sessions.splice(index, 1);
  } else if (data.action === 'add') {
    sessions.push({ id: data.id, title: data.title, dateCategory: data.dateCategory });
  }

  await saveSessions(sessions);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  const sessions = await loadSessions();
  const filtered = sessions.filter(s => s.id !== id);
  await saveSessions(filtered);
  return NextResponse.json({ success: true });
}
