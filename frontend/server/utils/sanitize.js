// Lightweight email validation to avoid external dependency in tests
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

const DEFAULT_STRICT_STRING_PATTERN = /[^a-zA-Z0-9_-]/g;

const DEFAULT_TEXT_PATTERN = /[^a-zA-Z0-9\s.,!?'"()@&$-]/g;

const HTML_TAG_PATTERN = /<[^>]*>?/g;


function sanitizeString(value, pattern = DEFAULT_STRICT_STRING_PATTERN) {
  if (typeof value !== 'string') {
    console.warn(`sanitizeString: Input is not a string (type: ${typeof value}). Returning empty string.`);
    return '';
  }
  if (!(pattern instanceof RegExp)) {
    console.warn(`sanitizeString: Provided pattern is not a RegExp. Using DEFAULT_STRICT_STRING_PATTERN.`);
    pattern = DEFAULT_STRICT_STRING_PATTERN;
  }
  return value.replace(pattern, '');
}

function sanitizeTextContent(value) {
  return sanitizeString(value, DEFAULT_TEXT_PATTERN);
}


function normalizeEmail(value) {
  if (typeof value !== 'string') {
    console.warn(`normalizeEmail: Input is not a string (type: ${typeof value}). Returning null.`);
    return null;
  }

  const trimmedValue = value.trim().toLowerCase();

  if (!isEmail(trimmedValue)) {
    console.warn(`normalizeEmail: Invalid email format detected for "${value}". Returning null.`);
    return null;
  }

  return trimmedValue;
}

function sanitizeId(value) {
  return sanitizeString(value, DEFAULT_STRICT_STRING_PATTERN);
}

function stripHtmlTags(value) {
  if (typeof value !== 'string') {
    console.warn(`stripHtmlTags: Input is not a string (type: ${typeof value}). Returning empty string.`);
    return '';
  }
  return value.replace(HTML_TAG_PATTERN, '');
}

function safeJsonParse(jsonString) {
  if (typeof jsonString !== 'string') {
    console.warn(`safeJsonParse: Input is not a string (type: ${typeof jsonString}). Returning null.`);
    return null;
  }
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error(`safeJsonParse: Failed to parse JSON string: "${jsonString.substring(0, 100)}..."`, error.message);
    return null;
  }
}

module.exports = {
  sanitizeString,
  sanitizeTextContent,
  normalizeEmail,
  sanitizeId,
  stripHtmlTags,
  safeJsonParse,
};
