import {
  MAX_FILENAME_CHAR_LENGTH,
  MAX_DATA_URI_LENGTH_CHARS,
  ALLOWED_MIME_TYPES,
  MIME_TYPE_REGEX,
  DATA_URI_REGEX,
} from '@/constants/attachments';

export interface RawAttachment {
  name: string;
  type: string;
  dataUri?: string;
}

export interface SanitizedAttachment {
  name: string;
  type: string;
  dataUri?: string;
}

export interface AttachmentPayload {
  attachment_name: string;
  attachment_type: string;
  attachment_data_uri_chunks: string[];
}

export function sanitizeAttachment(
  attachment: RawAttachment,
): SanitizedAttachment {
  const safeName = attachment.name
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, MAX_FILENAME_CHAR_LENGTH);

  let safeType = attachment.type.replace(/\s+/g, '').toLowerCase();
  if (
    !MIME_TYPE_REGEX.test(safeType) ||
    (ALLOWED_MIME_TYPES.size > 0 && !ALLOWED_MIME_TYPES.has(safeType))
  ) {
    safeType = 'application/octet-stream';
  }

  let dataUri = attachment.dataUri;
  if (dataUri) {
    dataUri = dataUri.replace(/[\r\n]/g, '');
    if (
      dataUri.length > MAX_DATA_URI_LENGTH_CHARS ||
      !dataUri.startsWith('data:') ||
      !DATA_URI_REGEX.test(dataUri)
    ) {
      dataUri = undefined;
    }
  }

  return { name: safeName, type: safeType, dataUri };
}

export function buildAttachmentPayload(
  attachment: RawAttachment,
  chunkSize: number = 100_000,
): { sanitized: SanitizedAttachment; payload: AttachmentPayload } {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    chunkSize = 100_000;
  }

  const sanitized = sanitizeAttachment(attachment);

  if (!sanitized.dataUri) {
    return {
      sanitized,
      payload: {
        attachment_name: sanitized.name,
        attachment_type: sanitized.type,
        attachment_data_uri_chunks: [],
      },
    };
  }

  const regex = new RegExp(`.{1,${chunkSize}}`, 'g');
  const chunks = sanitized.dataUri.match(regex) || [];

  return {
    sanitized,
    payload: {
      attachment_name: sanitized.name,
      attachment_type: sanitized.type,
      attachment_data_uri_chunks: chunks,
    },
  };
}
