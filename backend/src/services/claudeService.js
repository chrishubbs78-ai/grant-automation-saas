const Anthropic = require('@anthropic-ai/sdk');
const { getMockRFPAnalysis, getMockDraft } = require('./mockApiService');

// Check for API key at initialization
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const USE_MOCK_API = process.env.USE_MOCK_API === 'true' || !CLAUDE_API_KEY;

let anthropic = null;
let apiKeyMissing = false;

if (!CLAUDE_API_KEY) {
  if (process.env.USE_MOCK_API !== 'true') {
    console.warn('⚠️  WARNING: CLAUDE_API_KEY is not set. Using mock responses for development.');
    console.warn('   Add CLAUDE_API_KEY to your .env file to enable real Claude API calls.');
  }
  apiKeyMissing = true;
} else if (USE_MOCK_API && process.env.USE_MOCK_API === 'true') {
  console.warn('⚠️  DEMO_MODE: Using mock responses instead of Claude API.');
} else {
  anthropic = new Anthropic({
    apiKey: CLAUDE_API_KEY
  });
}

const MODEL = 'claude-sonnet-4-5';

// Parse RFP text and extract key information
async function parseRFP(rfpText) {
  // Use mock response if in demo mode or API key missing
  if (USE_MOCK_API) {
    console.log('[MOCK] Parsing RFP with mock Claude response...');
    return getMockRFPAnalysis(rfpText);
  }

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Parse this RFP/grant opportunity and extract structured information. Return ONLY valid JSON.

RFP TEXT:
${rfpText}

Return exactly this JSON structure (no other text):
{
  "funder_name": "name of the funding organization",
  "deadline": "deadline date in YYYY-MM-DD format or null if not found",
  "award_range": { "min": number or null, "max": number or null },
  "page_limit": number or null,
  "key_requirements": ["requirement 1", "requirement 2", ...],
  "evaluation_criteria": { "criterion_name": "description or weight", ... },
  "eligibility": { "who_can_apply": "description", "restrictions": ["restriction 1", ...] },
  "submission_method": "online form, email, mail, etc",
  "contact_info": { "email": "...", "phone": "...", "website": "..." }
}`
        }
      ]
    });

    const responseText = message.content[0].text;

    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      // If JSON parsing fails, return structured error
      console.error('Failed to parse Claude response:', responseText);
      return {
        error: 'Failed to parse RFP',
        raw_text: rfpText.substring(0, 500)
      };
    }
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Claude API error: ${error.message}`);
  }
}

// Generate draft sections using org profile + RFP analysis
async function generateDraft({ orgProfile, rfpAnalysis }) {
  // Use mock response if in demo mode or API key missing
  if (USE_MOCK_API) {
    console.log('[MOCK] Generating draft with mock Claude response...');
    return getMockDraft({ orgProfile, rfpAnalysis });
  }

  try {
    const context = `
ORGANIZATION PROFILE:
Name: ${orgProfile.name || 'Unknown'}
Mission: ${orgProfile.mission || 'Not provided'}
Track Record: ${orgProfile.track_record || 'Not provided'}

RFP ANALYSIS:
Funder: ${rfpAnalysis.funder_name || 'Unknown'}
Deadline: ${rfpAnalysis.deadline || 'Not specified'}
Requirements: ${rfpAnalysis.requirements?.join('; ') || 'None specified'}
Evaluation Criteria: ${JSON.stringify(rfpAnalysis.evaluation_criteria || {})}
Research Summary: ${JSON.stringify(rfpAnalysis.research_summary || {})}
    `;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: `Generate three draft sections for a grant proposal based on the organization and RFP details below.

Return ONLY valid JSON with this structure:
{
  "problem_statement": "1-2 paragraph description of the problem being addressed",
  "impact_statement": "1-2 paragraph description of expected impact and outcomes",
  "budget_narrative": "2-3 paragraphs justifying the budget and resource allocation"
}

CONTEXT:
${context}`
        }
      ]
    });

    const responseText = message.content[0].text;

    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Claude draft response:', responseText);
      return {
        problem_statement: 'Draft generation experienced an issue. Please revise manually.',
        impact_statement: 'Unable to generate this section.',
        budget_narrative: 'Unable to generate this section.'
      };
    }
  } catch (error) {
    console.error('Claude draft generation error:', error);
    throw new Error(`Draft generation failed: ${error.message}`);
  }
}

module.exports = {
  parseRFP,
  generateDraft
};
