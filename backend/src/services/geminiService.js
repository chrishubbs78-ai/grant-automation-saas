const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getMockFunderResearch } = require('./mockApiService');

// Check for API key at initialization
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const USE_MOCK_API = process.env.USE_MOCK_API === 'true' || !GEMINI_API_KEY;

let genai = null;
let apiKeyMissing = false;

if (!GEMINI_API_KEY) {
  if (process.env.USE_MOCK_API !== 'true') {
    console.warn('⚠️  WARNING: GEMINI_API_KEY is not set. Using mock responses for development.');
    console.warn('   Add GEMINI_API_KEY to your .env file to enable real Gemini API calls.');
  }
  apiKeyMissing = true;
} else if (USE_MOCK_API && process.env.USE_MOCK_API === 'true') {
  console.warn('⚠️  DEMO_MODE: Using mock responses instead of Gemini API.');
} else {
  genai = new GoogleGenerativeAI(GEMINI_API_KEY);
}

const MODEL = 'gemini-1.5-flash';

// Research a funder based on their name and requirements
async function researchFunder(funderName, requirements = []) {
  // Use mock response if in demo mode or API key missing
  if (USE_MOCK_API) {
    console.log('[MOCK] Researching funder with mock Gemini response...');
    return getMockFunderResearch(funderName, requirements);
  }

  try {
    const model = genai.getGenerativeModel({ model: MODEL });

    const prompt = `Research this funder and provide intelligence about their funding patterns, priorities, and success factors. Return valid JSON only.

Funder: ${funderName}
Requirements they mention: ${requirements.join(', ') || 'general grant requirements'}

Return exactly this JSON structure (no other text):
{
  "funder_priorities": ["priority 1", "priority 2", "priority 3"],
  "success_patterns": "Description of what makes successful proposals for this funder",
  "typical_award_size": "range or description",
  "funding_rate": "estimated percentage of successful applicants or null",
  "red_flags": ["thing that gets proposals rejected", ...],
  "insider_tips": ["tip 1", "tip 2", ...]
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    try {
      return JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText);
      return {
        funder_priorities: [],
        success_patterns: 'Unable to generate research',
        error: 'Research parsing failed'
      };
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

module.exports = {
  researchFunder
};
