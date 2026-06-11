const path = require('path');

// Lazy-load heavy parsers only when needed
let pdfParse = null;
let mammoth = null;

function loadPdfParse() {
  if (!pdfParse) pdfParse = require('pdf-parse');
  return pdfParse;
}

function loadMammoth() {
  if (!mammoth) mammoth = require('mammoth');
  return mammoth;
}

const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
  'text/html': 'txt'
};

const EXT_MAP = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.doc': 'doc',
  '.txt': 'txt',
  '.md': 'txt',
  '.rtf': 'txt'
};

function detectType(mimeType, fileName) {
  if (mimeType && SUPPORTED_TYPES[mimeType]) return SUPPORTED_TYPES[mimeType];
  if (fileName) {
    const ext = path.extname(fileName).toLowerCase();
    if (EXT_MAP[ext]) return EXT_MAP[ext];
  }
  return null;
}

/**
 * Extract plain text from a base64-encoded file.
 * @param {string} base64Data - base64-encoded file content
 * @param {string} mimeType   - MIME type string
 * @param {string} fileName   - original file name (used for extension fallback)
 * @returns {Promise<string>} extracted text
 */
async function extractTextFromBase64(base64Data, mimeType, fileName) {
  const type = detectType(mimeType, fileName);

  if (!type) {
    throw new Error(`Unsupported file type: ${mimeType || path.extname(fileName || '') || 'unknown'}. Use PDF, DOCX, or TXT.`);
  }

  const buffer = Buffer.from(base64Data, 'base64');
  return extractTextFromBuffer(buffer, type, fileName);
}

/**
 * Extract plain text from a Buffer.
 */
async function extractTextFromBuffer(buffer, type, fileName) {
  switch (type) {
    case 'pdf': {
      const parse = loadPdfParse();
      const result = await parse(buffer);
      const text = result.text || '';
      if (!text.trim()) {
        throw new Error('PDF appears to be image-based (scanned). Please use a text-layer PDF or copy-paste the text directly.');
      }
      return text;
    }

    case 'docx': {
      const mam = loadMammoth();
      const result = await mam.extractRawText({ buffer });
      return result.value || '';
    }

    case 'doc':
      // .doc (legacy Word) — mammoth handles many .doc files too
      try {
        const mam = loadMammoth();
        const result = await mam.extractRawText({ buffer });
        return result.value || '';
      } catch {
        throw new Error('.doc (legacy Word) format is not fully supported. Please save as .docx or .pdf and re-upload.');
      }

    case 'txt':
    default:
      return buffer.toString('utf8');
  }
}

/**
 * Truncate extracted text to a safe token budget for Claude.
 * ~15,000 words ≈ 20,000 tokens, well within claude-sonnet context.
 */
function truncateForClaude(text, maxChars = 60000) {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) +
    `\n\n[Document truncated at ${maxChars} characters for processing. Full text is ${text.length} chars.]`;
}

module.exports = { extractTextFromBase64, extractTextFromBuffer, truncateForClaude, detectType };
