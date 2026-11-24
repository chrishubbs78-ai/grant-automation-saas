/**
 * Shared Claude call for the long-form writing features added for the
 * business plan builder, funder tailoring and loan packets.
 *
 * - Streams (long outputs would otherwise hit HTTP timeouts) and waits for the
 *   final message.
 * - Optional web research through Anthropic's server-side web search tool, so
 *   market sections can cite real local numbers instead of invented ones.
 * - Server-side refusal fallback is on, so a classifier false positive on a
 *   youth-program proposal does not silently return nothing.
 * - Returns parsed JSON; callers describe the shape in the prompt.
 *
 * Mock mode (USE_MOCK_API=true or no key) never reaches the network: callers
 * pass a `mock` function that builds a deterministic response.
 */
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const WRITER_MODEL = process.env.CLAUDE_WRITER_MODEL || 'claude-opus-5-5';
const MAX_CONTINUATIONS = 4;

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: CLAUDE_API_KEY });
  return client;
}

function useMock() {
  return process.env.USE_MOCK_API === 'true' || !process.env.CLAUDE_API_KEY;
}

/** Pull the first JSON object out of model text, tolerating code fences. */
function extractJson(text) {
  if (!text) throw new Error('Empty response from Claude');
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('No JSON object in Claude response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function textOf(message) {
  return (message.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
}

/** URLs the web search tool returned, so research can show its sources. */
function sourcesOf(messages) {
  const urls = new Map();
  for (const m of messages) {
    for (const block of m.content || []) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.url && !urls.has(r.url)) urls.set(r.url, r.title || r.url);
        }
      }
    }
  }
  return [...urls.entries()].slice(0, 15).map(([url, title]) => ({ url, title }));
}

/**
 * @param {object} opts
 * @param {string} opts.system   Stable instructions (voice, rules).
 * @param {string} opts.prompt   The request, including the JSON shape wanted.
 * @param {Function} opts.mock   () => object, used in mock mode.
 * @param {boolean} [opts.webResearch] Allow web search for facts and figures.
 * @param {string} [opts.effort] low | medium | high | xhigh | max
 * @param {number} [opts.maxTokens]
 * @returns {Promise<object>} parsed JSON, plus `_sources` when research ran
 */
async function writeJson({ system, prompt, mock, webResearch = false, effort = 'high', maxTokens = 32000 }) {
  if (useMock()) {
    return mock();
  }

  const tools = webResearch && process.env.CLAUDE_WEB_RESEARCH !== 'false'
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }]
    : undefined;

  const messages = [{ role: 'user', content: prompt }];
  const responses = [];

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = getClient().beta.messages.stream({
      model: WRITER_MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort },
      system,
      messages,
      ...(tools ? { tools } : {})
    });
    const message = await stream.finalMessage();
    responses.push(message);

    if (message.stop_reason === 'refusal') {
      const category = message.stop_details && message.stop_details.category;
      throw new Error(`Claude declined this request${category ? ` (${category})` : ''}. Try rewording the inputs.`);
    }
    // A long server-tool turn can pause; send the content back to let it finish.
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    if (message.stop_reason === 'max_tokens') {
      logger.warn({ model: WRITER_MODEL }, 'Writer hit max_tokens; output may be cut short');
    }

    const parsed = extractJson(textOf(message));
    if (tools) parsed._sources = sourcesOf(responses);
    return parsed;
  }

  throw new Error('Claude did not finish after several continuations');
}

module.exports = { writeJson, extractJson, WRITER_MODEL, useMock };
