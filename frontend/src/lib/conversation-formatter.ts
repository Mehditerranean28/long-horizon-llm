
import type { ChatMessage, CognitiveQueryAnalysisProtocol } from '@/types';

function formatTimestamp(date: Date): string {
  return date.toISOString(); // Simple ISO string format
}

export function formatConversationForExport(messages: ChatMessage[]): string {
  let exportText = "Sovereign Conversation Export\n";
  exportText += `Exported on: ${formatTimestamp(new Date())}\n\n`;
  exportText += "========================================\n\n";

  messages.forEach((msg) => {
    if (msg.isLoading) return; // Skip loading messages

    const role = msg.role === 'user' ? 'User' : 'Sovereign';
    const timestamp = formatTimestamp(msg.timestamp);

    exportText += `${role} (${timestamp}):\n`;

    if (msg.role === 'user') {
      exportText += `${msg.content}\n`;
      if (msg.attachmentName) {
        exportText += `[Attachment: ${msg.attachmentName}]\n`;
      }
    } else { // Assistant message
      if (msg.messageType === 'cognitive_analysis_table' && msg.cognitiveAnalysisData) {
        exportText += `[Cognitive Analysis Data]:\n${JSON.stringify(msg.cognitiveAnalysisData, null, 2)}\n`;
      } else if (msg.parsedContent && msg.parsedContent.sections.length > 0) {
        msg.parsedContent.sections.forEach(section => {
          switch (section.type) {
            case 'heading':
              exportText += `${'#'.repeat(section.level || 1)} ${section.text}\n`;
              break;
            case 'paragraph':
              exportText += `${section.text}\n`;
              break;
            case 'list':
              section.items?.forEach(item => {
                exportText += `- ${item}\n`;
              });
              break;
            case 'code':
              exportText += `\`\`\`${section.language || ''}\n${section.text}\n\`\`\`\n`;
              break;
            case 'citation':
              exportText += `> ${section.text}\n`;
              break;
            default:
              exportText += `${section.text}\n`;
          }
        });
      } else {
        exportText += `${msg.content}\n`; // Fallback for simple text or unparsed content
      }
    }
    exportText += "\n----------------------------------------\n\n";
  });

  return exportText;
}
