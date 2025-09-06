
import type { ContentSection, ParsedChatMessageContent } from '@/types';
import { v4 as uuidv4 } from 'uuid';

function isJsonString(str: string) {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null;
  } catch (e) {
    return false;
  }
}

export function parseAiAnswerContent(rawText: string): ParsedChatMessageContent {
  const sections: ContentSection[] = [];
  
  if (isJsonString(rawText)) {
    return { sections: [] }; 
  }

  const lines = rawText.split(/\r?\n/);
  let currentListItems: string[] | null = null;
  let inCodeBlock = false;
  let currentCodeLines: string[] = [];
  let currentCodeLang: string | undefined = undefined;

  function flushList() {
    if (currentListItems && currentListItems.length > 0) {
      sections.push({
        id: uuidv4(),
        type: 'list',
        text: '', 
        items: currentListItems,
        canShowEvidence: true, 
      });
    }
    currentListItems = null;
  }

  function flushCodeBlock() {
    if (currentCodeLines.length > 0) {
      sections.push({
        id: uuidv4(),
        type: 'code',
        text: currentCodeLines.join('\n'),
        language: currentCodeLang,
      });
    }
    currentCodeLines = [];
    currentCodeLang = undefined;
    inCodeBlock = false;
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        flushCodeBlock();
      } else {
        // Start of code block
        flushList(); // Ensure any pending list is flushed
        inCodeBlock = true;
        currentCodeLang = line.substring(3).trim() || undefined;
      }
      continue;
    }

    if (inCodeBlock) {
      currentCodeLines.push(line);
      continue;
    }

    // Not in a code block, process other markdown
    if (line.startsWith('# ')) {
      flushList();
      sections.push({ id: uuidv4(), type: 'heading', text: line.substring(2).trim(), level: 1, canDeepDive: true });
    } else if (line.startsWith('## ')) {
      flushList();
      sections.push({ id: uuidv4(), type: 'heading', text: line.substring(3).trim(), level: 2, canDeepDive: true });
    } else if (line.startsWith('### ')) {
      flushList();
      sections.push({ id: uuidv4(), type: 'heading', text: line.substring(4).trim(), level: 3, canDeepDive: true });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!currentListItems) {
        currentListItems = [];
      }
      currentListItems.push(line.substring(2).trim());
    } else if (line.trim().length > 0) {
      flushList();
      const canShowEvidence = !/\[\d+\]$/.test(line.trim());
      sections.push({ id: uuidv4(), type: 'paragraph', text: line.trim(), canShowEvidence });
    } else if (line.trim().startsWith('>') && line.includes('Source:')) { 
      flushList();
      sections.push({ id: uuidv4(), type: 'citation', text: line.substring(1).trim() });
    } else {
      flushList();
    }
  }
  flushList();
  if (inCodeBlock) flushCodeBlock(); // Ensure hanging code block is flushed if ``` is missing at end

  return { sections };
}
