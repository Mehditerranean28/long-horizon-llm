import { createStore, get, set, del, clear } from 'idb-keyval';

const store = createStore('son-of-anton', 'chats');

const MAX_MESSAGE_LENGTH = 2000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function sanitize(message: ChatMessage): ChatMessage {
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  const content = String(message.content).slice(0, MAX_MESSAGE_LENGTH).trim();
  return { role, content };
}

export async function saveChat(id: string, messages: ChatMessage[]): Promise<void> {
  const sanitized = messages.map(sanitize);
  await set(id, sanitized, store);
}

export async function loadChat(id: string): Promise<ChatMessage[] | undefined> {
  const messages = await get<ChatMessage[]>(id, store);
  return messages?.map(sanitize);
}

export async function deleteChat(id: string): Promise<void> {
  await del(id, store);
}

export async function clearAllChats(): Promise<void> {
  await clear(store);
}
