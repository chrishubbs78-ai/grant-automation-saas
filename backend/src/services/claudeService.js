const Anthropic = require('@anthropic-ai/sdk');
const { getMockRFPAnalysis, getMockDraft, getMockImprovedDraft } = require('./mockApiService');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const USE_MOCK_API = process.env.USE_MOCK_API === 'true' || !CLAUDE_API_KEY;

let anthropic = null;

if (!CLAUDE_API_KEY) {
  if (process.env.USE_MOCK_API !== 'true') {
    console.warn('⚠️  WARNING: CLAUDE_API_KEY is not set. Using mock responses for development.');
  }
} else if (!USE_MOCK_API) {
  anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY });
}

const MODEL = 'claude-sonnet-4-6';

// ─── RFP PARSING ──────────────────────────────────────────────────────────────

async function parseRFP(rfpText) {
  if (USE_MOCK_API) {
    console.log('[MOCK] Parsing RFP with mock Claude response...');
    return getMockRFPAnalysis(rfpText);
  }

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an expert grant analyst. Parse this RFP/grant opportunity and extract all key information. Return ONLY valid JSON.

RFP TEXT:
${rfpText}

Return exactly this JSON structure:
{
  "funder_name": "name of the funding organization",
  "deadline": "YYYY-MM-DD or null",
  "award_range": { "min": number_or_null, "max": number_or_null },
  "page_limit": number_or_null,
  "key_requirements": ["requirement 1", ...],
  "evaluation_criteria": { "criterion": "weight or description", ... },
  "eligibility": { "who_can_apply": "description", "restrictions": ["..."] },
  "priority_areas": ["funder priority 1", ...],
  "submission_method": "online/email/mail/portal",
  "contact_info": { "email": "...", "phone": "...", "website": "..." },
  "reporting_requirements": "brief description or null",
  "matching_requirements": "match requirement or null"
}`
    }]
  });

  try {
    return JSON.parse(message.content[0].text);
  } catch {
    return { error: 'Failed to parse RFP', raw_text: rfpText.substring(0, 500) };
  }
}

// ─── ORG PROFILE CONTEXT BUILDER ──────────────────────────────────────────────

function buildOrgContext(org) {
  const programs = (org.programsAndServices || org.programs_and_services || [])
    .map(p => `  • ${p.name}: ${p.description}${p.annual_participants ? ` (${p.annual_participants} participants/year)` : ''}${p.outcomes ? ` — Outcomes: ${p.outcomes}` : ''}`)
    .join('\n') || '  (Not provided)';

  const keyStaff = (org.keyStaff || org.key_staff || [])
    .map(s => `  • ${s.name}, ${s.title}${s.years_experience ? ` (${s.years_experience} yrs experience)` : ''}${s.bio ? `: ${s.bio}` : ''}`)
    .join('\n') || '  (Not provided)';

  const previousGrantors = (org.previousGrantors || org.previous_grantors || [])
    .map(g => `  • ${g.funder_name}: $${g.amount?.toLocaleString() || 'N/A'}${g.year ? ` (${g.year})` : ''}${g.purpose ? ` — ${g.purpose}` : ''}`)
    .join('\n') || '  (None listed)';

  const outcomes = org.outcomesData || org.outcomes_data || {};
  const outcomesStr = outcomes.recent_results
    ? (Array.isArray(outcomes.recent_results) ? outcomes.recent_results.join('; ') : outcomes.recent_results)
    : (org.trackRecord || org.track_record || 'Not provided');

  return `ORGANIZATION: ${org.name}
EIN: ${org.ein || 'Not provided'} | Tax Status: ${org.taxExemptStatus || org.tax_exempt_status || '501(c)(3)'}
Website: ${org.website || 'N/A'} | Phone: ${org.phone || 'N/A'}
Years Operating: ${org.yearsInOperation || org.years_in_operation || 'N/A'}
Geographic Scope: ${org.geographicScope || org.geographic_scope || 'local'} — ${org.geographicServiceArea || org.geographic_service_area || 'N/A'}
Annual Clients Served: ${org.annualClientsServed || org.annual_clients_served || 'N/A'}
Annual Budget: $${(org.annualBudget || org.annual_budget || 0).toLocaleString()}
Financial Health: ${org.financialStatus || org.financial_status || 'stable'} | Reserves: ${org.reservesMonths || org.reserves_months || 'N/A'} months | Audited: ${org.auditCompleted || org.audit_completed ? 'Yes' : 'No'}
Revenue Mix: ${JSON.stringify(org.revenueBreakdown || org.revenue_breakdown || {})}

MISSION: ${org.mission || 'Not provided'}
VISION: ${org.vision || 'Not provided'}
THEORY OF CHANGE: ${org.theoryOfChange || org.theory_of_change || 'Not provided'}

PROBLEM ADDRESSED: ${org.problemStatement || org.problem_statement || 'Not provided'}
TARGET POPULATION: ${org.targetPopulation || org.target_population || 'Not provided'}

PROGRAMS & SERVICES:
${programs}

EVIDENCE BASE: ${org.evidenceBase || org.evidence_base || 'Not provided'}
OUTCOMES DATA: ${outcomesStr}

KEY STAFF:
${keyStaff}

BOARD: ${JSON.stringify(org.boardComposition || org.board_composition || {})}
PARTNERSHIPS: ${JSON.stringify(org.partnerships || [])}
SUSTAINABILITY PLAN: ${org.sustainabilityPlan || org.sustainability_plan || 'Not provided'}
DEI COMMITMENT: ${org.diversityEquityInclusion || org.diversity_equity_inclusion || 'Not provided'}

PREVIOUS FUNDERS:
${previousGrantors}`;
}

// ─── FULL EXPERT DRAFT GENERATION ─────────────────────────────────────────────

async function generateDraft({ orgProfile, rfpAnalysis, analytics }) {
  if (USE_MOCK_API) {
    console.log('[MOCK] Generating expert draft with mock Claude response...');
    return getMockDraft({ orgProfile, rfpAnalysis });
  }

  const orgContext = buildOrgContext(orgProfile);
  const learningContext = analytics && analytics.recommendations && analytics.recommendations.length > 0
    ? `\nLEARNING ENGINE INSIGHTS (from past submissions):\n${analytics.recommendations.map(r => `  • ${r.message || r}`).join('\n')}`
    : '';

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 5000,
    messages: [{
      role: 'user',
      content: `You are a professional grant writer with 20+ years of experience winning millions in funding for nonprofits. Write a compelling, complete grant proposal for the organization below targeting the specified funder.

Your writing must:
- Sound authoritative and evidence-based — use specific numbers, not vague claims
- Directly address the funder's evaluation criteria and priority areas
- Demonstrate the organization's credibility, capacity, and track record
- Use language that mirrors the funder's stated values and vocabulary
- Be concrete about outcomes, not just activities
- Show why THIS org is uniquely positioned to do this work

Return ONLY valid JSON with this exact structure (no other text):
{
  "executive_summary": "3-4 sentence compelling overview that immediately captures why this org + this project = perfect fit for this funder",
  "organization_background": "2 paragraphs: history, credibility, and why you're the right org to address this need",
  "statement_of_need": "2-3 paragraphs: the problem with local/national statistics, who suffers, why it's urgent, and why it's not being solved yet",
  "goals_and_objectives": "3-5 specific, measurable SMART objectives with timeframes and numeric targets",
  "program_design": "2-3 paragraphs: your approach, methodology, activities, timeline, and evidence base",
  "evaluation_plan": "1-2 paragraphs: what you'll measure, how, who collects data, and how you'll use findings",
  "sustainability_plan": "1-2 paragraphs: how this work continues after the grant, other funding sources, revenue diversification",
  "budget_narrative": "3-4 paragraphs: line-item justification, cost-per-participant, staff allocation, overhead rationale, any match/leverage"
}

ORGANIZATION PROFILE:
${orgContext}

GRANT OPPORTUNITY:
Funder: ${rfpAnalysis.funder_name || 'Unknown'}
Deadline: ${rfpAnalysis.deadline || 'Not specified'}
Award Range: $${rfpAnalysis.award_range?.min?.toLocaleString() || 'N/A'} – $${rfpAnalysis.award_range?.max?.toLocaleString() || 'N/A'}
Page Limit: ${rfpAnalysis.page_limit || 'Not specified'}
Funder Priority Areas: ${(rfpAnalysis.priority_areas || []).join('; ') || 'Not specified'}
Key Requirements: ${(rfpAnalysis.key_requirements || rfpAnalysis.requirements || []).join('; ') || 'None specified'}
Evaluation Criteria: ${JSON.stringify(rfpAnalysis.evaluation_criteria || {})}
Eligibility: ${JSON.stringify(rfpAnalysis.eligibility || {})}
Matching Requirements: ${rfpAnalysis.matching_requirements || 'None'}
${learningContext}`
    }]
  });

  try {
    return JSON.parse(message.content[0].text);
  } catch {
    console.error('Failed to parse Claude expert draft:', message.content[0].text.substring(0, 300));
    return {
      executive_summary: 'Draft generation experienced a parsing issue. Please regenerate.',
      organization_background: '',
      statement_of_need: '',
      goals_and_objectives: '',
      program_design: '',
      evaluation_plan: '',
      sustainability_plan: '',
      budget_narrative: ''
    };
  }
}

// ─── IMPROVED REAPPLY DRAFT ───────────────────────────────────────────────────

async function generateImprovedDraft({ orgProfile, rfpAnalysis, previousDraft, rejectionFeedback, recommendations }) {
  if (USE_MOCK_API) {
    console.log('[MOCK] Generating improved draft with mock Claude response...');
    return getMockImprovedDraft({ orgProfile, rfpAnalysis, previousDraft, rejectionFeedback });
  }

  const orgContext = buildOrgContext(orgProfile);

  const prevSummary = previousDraft ? `
PREVIOUS REJECTED DRAFT:
Executive Summary: ${previousDraft.executive_summary || previousDraft.problem_statement || 'N/A'}
Statement of Need: ${previousDraft.statement_of_need || previousDraft.problem_statement || 'N/A'}
Goals & Objectives: ${previousDraft.goals_and_objectives || 'N/A'}
Program Design: ${previousDraft.program_design || 'N/A'}
Budget Narrative: ${previousDraft.budget_narrative || 'N/A'}` : '';

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 5000,
    messages: [{
      role: 'user',
      content: `You are a professional grant writer. A previous version of this proposal was REJECTED. Rewrite it with targeted improvements that directly address the rejection feedback and the learning insights.

Do NOT simply repeat the previous draft. You must:
- Directly rebut or address every piece of rejection feedback
- Sharpen the need statement with stronger data
- Make objectives more specific and measurable
- Strengthen the evidence base and evaluation plan
- Fix any budget weakness or vagueness
- Realign language with the funder's stated priorities

Return ONLY valid JSON with this exact structure:
{
  "executive_summary": "improved executive summary",
  "organization_background": "improved org background",
  "statement_of_need": "improved need statement with stronger data",
  "goals_and_objectives": "improved SMART objectives",
  "program_design": "improved methodology section",
  "evaluation_plan": "improved evaluation plan",
  "sustainability_plan": "improved sustainability section",
  "budget_narrative": "improved budget narrative",
  "improvement_summary": "1 paragraph plainly explaining what was changed and why, specific to the feedback"
}

ORGANIZATION PROFILE:
${orgContext}

GRANT OPPORTUNITY:
Funder: ${rfpAnalysis.funder_name || 'Unknown'}
Requirements: ${(rfpAnalysis.key_requirements || rfpAnalysis.requirements || []).join('; ')}
Evaluation Criteria: ${JSON.stringify(rfpAnalysis.evaluation_criteria || {})}
Priority Areas: ${(rfpAnalysis.priority_areas || []).join('; ') || 'Not specified'}
${prevSummary}

REJECTION FEEDBACK:
${rejectionFeedback || 'No specific feedback provided — address typical weaknesses.'}

LEARNING ENGINE RECOMMENDATIONS:
${(recommendations || []).map(r => `• ${r.message || r}`).join('\n') || 'None'}`
    }]
  });

  try {
    return JSON.parse(message.content[0].text);
  } catch {
    return {
      ...(previousDraft || {}),
      improvement_summary: 'Automatic improvement failed; previous draft retained.'
    };
  }
}

module.exports = { parseRFP, generateDraft, generateImprovedDraft };
