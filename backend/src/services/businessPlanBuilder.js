/**
 * Guided business plan builder.
 *
 * Asks the owner plain questions section by section, researches the market
 * where numbers matter, reviews the answers for gaps a funder or lender would
 * catch, and writes each section in a professional voice. Written sections land
 * in Organization.businessPlan, which every grant draft and loan packet
 * already reads, so a better plan improves every application at once.
 */
const { writeJson } = require('./claudeWriter');

const SECTIONS = [
  {
    key: 'executive_summary',
    title: 'Executive Summary',
    why: 'The first page every reviewer reads. Written last, from everything else.',
    questions: [
      { id: 'es_one_liner', prompt: 'In one sentence, what is the business and who is it for?', required: true },
      { id: 'es_why_now', prompt: 'Why is now the right time, and why you?', required: true },
      { id: 'es_ask', prompt: 'How much capital do you need in total, and what will it unlock?', required: true }
    ]
  },
  {
    key: 'products_and_programs',
    title: 'Products, Services & Programs',
    why: 'What you sell and run. Funders and lenders want to see several revenue streams.',
    questions: [
      { id: 'pp_retail', prompt: 'What will you sell? (games, accessories, snacks, memberships, etc.)', required: true },
      { id: 'pp_play_space', prompt: 'Will you charge for table time, events, tournaments or private parties? How much?', required: true },
      { id: 'pp_other_revenue', prompt: 'Any other income: café, classes, birthday parties, school field trips, summer camps?' }
    ]
  },
  {
    key: 'youth_program',
    title: 'Youth After-School & Guided Gaming Program',
    why: 'This is what grant funders pay for. They want outcomes, not just activities.',
    research: true,
    questions: [
      { id: 'yp_who', prompt: 'Which kids will it serve? (ages, schools, neighborhoods, any focus like neurodivergent kids or kids without other after-school options)', required: true },
      { id: 'yp_schedule', prompt: 'When will it run, and how many kids per session and per year?', required: true },
      { id: 'yp_activities', prompt: 'What happens in a session? (guided play, game design, tabletop RPGs, homework time, snacks)', required: true },
      { id: 'yp_outcomes', prompt: 'What should change for the kids? (social skills, math and reading, teamwork, belonging). How will you measure it?', required: true },
      { id: 'yp_cost_to_families', prompt: 'Will families pay? Free, sliding scale, or scholarships?', required: true },
      { id: 'yp_staff', prompt: 'Who leads the sessions, and what training or background checks will they have?', required: true },
      { id: 'yp_partners', prompt: 'Any schools, libraries, counselors or youth groups you could partner with?' }
    ]
  },
  {
    key: 'market_analysis',
    title: 'Market & Community Analysis',
    why: 'Proves people will come. Real local numbers beat adjectives.',
    research: true,
    questions: [
      { id: 'ma_location', prompt: 'City and neighborhood you plan to open in (or are considering)?', required: true },
      { id: 'ma_customers', prompt: 'Who are your main customers besides the kids? (families, teens, adult hobbyists, college students)', required: true },
      { id: 'ma_competitors', prompt: 'Nearby game stores, cafés or after-school programs you know of, and how you will be different?', required: true },
      { id: 'ma_evidence', prompt: 'Any proof of demand so far? (survey, waitlist, social following, game nights you have run)' }
    ]
  },
  {
    key: 'marketing_outreach',
    title: 'Marketing & Outreach',
    why: 'How customers and families will find you.',
    questions: [
      { id: 'mo_channels', prompt: 'How will people hear about you? (social media, schools, events, Discord, local press)', required: true },
      { id: 'mo_launch', prompt: 'What is your opening plan for the first 90 days?' },
      { id: 'mo_retention', prompt: 'How will you keep people coming back? (leagues, loyalty, memberships, community nights)' }
    ]
  },
  {
    key: 'operations_plan',
    title: 'Operations Plan',
    why: 'Shows you can actually run it day to day.',
    questions: [
      { id: 'op_space', prompt: 'What kind of space do you need? (square feet, tables, storage, rent estimate)', required: true },
      { id: 'op_hours', prompt: 'Planned opening hours?', required: true },
      { id: 'op_staffing', prompt: 'Staff you need at opening and in year two?', required: true },
      { id: 'op_suppliers', prompt: 'How will you source inventory? (distributors, publishers, used games)' },
      { id: 'op_safety', prompt: 'Youth safety: background checks, pickup policy, insurance?', required: true }
    ]
  },
  {
    key: 'management_team',
    title: 'Management & Team',
    why: 'Lenders lend to people. Show relevant experience.',
    questions: [
      { id: 'mt_owner', prompt: 'Your background: work history, management, retail, teaching or youth work?', required: true },
      { id: 'mt_advisors', prompt: 'Anyone helping you? (mentor, accountant, SCORE or SBDC advisor, board members for the program)' }
    ]
  },
  {
    key: 'financial_projections',
    title: 'Financial Projections',
    why: 'The section lenders read hardest. Every number needs a basis.',
    research: true,
    questions: [
      { id: 'fp_startup_costs', prompt: 'Startup costs you know of: build-out, furniture, opening inventory, deposits, equipment, working capital?', required: true },
      { id: 'fp_monthly_costs', prompt: 'Expected monthly costs: rent, payroll, utilities, insurance, software?', required: true },
      { id: 'fp_revenue', prompt: 'Your best guess at monthly sales once established, and how you got that number?', required: true },
      { id: 'fp_owner_investment', prompt: 'How much of your own money can you put in?', required: true },
      { id: 'fp_break_even', prompt: 'When do you expect to break even?' }
    ]
  },
  {
    key: 'funding_strategy',
    title: 'Funding Strategy',
    why: 'How grants, loans and your own money fit together.',
    questions: [
      { id: 'fs_mix', prompt: 'Roughly how do you hope to split funding between your money, loans and grants?', required: true },
      { id: 'fs_sponsor', prompt: 'Have you talked to a nonprofit about fiscally sponsoring the youth program?' },
      { id: 'fs_other', prompt: 'Any other sources? (family, crowdfunding, publisher partnerships, local business sponsors)' }
    ]
  },
  {
    key: 'growth_strategy',
    title: 'Growth Strategy',
    why: 'Where this goes in three to five years.',
    questions: [
      { id: 'gs_three_years', prompt: 'What does success look like in three years?', required: true },
      { id: 'gs_expansion', prompt: 'Any plans for more programs, a second location, or school contracts?' }
    ]
  },
  {
    key: 'risks_and_mitigation',
    title: 'Risks & Mitigation',
    why: 'Naming risks yourself builds trust with reviewers.',
    questions: [
      { id: 'rm_risks', prompt: 'What worries you most? (slow months, rent, online competition, staffing)', required: true },
      { id: 'rm_plan', prompt: 'What would you do if sales came in 30% under plan?' }
    ]
  }
];

const SECTION_KEYS = SECTIONS.map(s => s.key);
const QUESTION_INDEX = new Map(SECTIONS.flatMap(s => s.questions.map(q => [q.id, { ...q, section: s.key }])));

function answered(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null && value !== '';
}

/** Per-section and overall progress through the required questions. */
function completeness(answers = {}) {
  let requiredTotal = 0;
  let requiredDone = 0;
  const sections = SECTIONS.map(section => {
    const required = section.questions.filter(q => q.required);
    const missing = required.filter(q => !answered(answers[q.id])).map(q => q.id);
    requiredTotal += required.length;
    requiredDone += required.length - missing.length;
    return {
      key: section.key,
      answered: section.questions.filter(q => answered(answers[q.id])).length,
      total: section.questions.length,
      missing_required: missing,
      ready_to_write: missing.length === 0
    };
  });
  return {
    percent: requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0,
    sections
  };
}

/** Keep only known question ids with string values, capped in length. */
function sanitizeAnswers(input = {}) {
  const out = {};
  for (const [id, value] of Object.entries(input)) {
    if (!QUESTION_INDEX.has(id)) continue;
    if (value === null || value === undefined) continue;
    out[id] = String(value).slice(0, 4000);
  }
  return out;
}

/**
 * Free, instant checks that do not need Claude: the things funders and SBA
 * lenders most often bounce an application for.
 */
function quickRecommendations(org, answers = {}) {
  const recs = [];
  const sponsor = org.fiscalSponsor || {};
  const loan = org.loanProfile || {};

  if (['for_profit_small_business', 'hybrid'].includes(org.entityType) && !sponsor.name) {
    recs.push({
      priority: 'high',
      area: 'Grant eligibility',
      message: 'Line up a fiscal sponsor for the youth program. Most foundation and youth grants only pay nonprofits, and a sponsor lets the program apply while the store stays a business.'
    });
  }
  if (!answered(answers.yp_outcomes)) {
    recs.push({
      priority: 'high',
      area: 'Youth program',
      message: 'Describe the outcomes for kids and how you will measure them (a short pre/post survey works). Funders score outcomes more heavily than activities.'
    });
  }
  if (!answered(answers.fp_owner_investment) && !loan.owner_equity) {
    recs.push({
      priority: 'high',
      area: 'Loans',
      message: 'Say how much of your own money you can invest. SBA lenders usually expect a startup owner to put in around 10% or more of the total project cost.'
    });
  }
  if (!answered(answers.ma_evidence)) {
    recs.push({
      priority: 'medium',
      area: 'Market',
      message: 'Collect early proof of demand: run a few pop-up game nights, start an interest list, or survey local parents. Even 50 sign-ups strengthens both grants and loans.'
    });
  }
  if (!answered(answers.mt_advisors)) {
    recs.push({
      priority: 'medium',
      area: 'Team',
      message: 'Book a free session with your local Small Business Development Center (SBDC) or SCORE mentor. Lenders view an advised plan more favorably, and they can review your projections.'
    });
  }
  if (!answered(answers.op_safety)) {
    recs.push({
      priority: 'medium',
      area: 'Youth safety',
      message: 'Write down background checks, a pickup policy and liability insurance for the youth program. Sponsors and funders will ask before anything else.'
    });
  }
  return recs;
}

function planSnapshot(org) {
  const answers = (org.businessPlanBuilder && org.businessPlanBuilder.answers) || {};
  const lines = SECTIONS.map(section => {
    const qa = section.questions
      .filter(q => answered(answers[q.id]))
      .map(q => `  Q: ${q.prompt}\n  A: ${answers[q.id]}`)
      .join('\n');
    return `## ${section.title}\n${qa || '  (no answers yet)'}`;
  });
  const city = answers.ma_location || (org.address && [org.address.city, org.address.state].filter(Boolean).join(', ')) || 'not given';
  return `BUSINESS: ${org.name || 'Unnamed'}\nLOCATION: ${city}\nSTRUCTURE: ${org.entityType || 'nonprofit'}${org.fiscalSponsor && org.fiscalSponsor.name ? ` (youth program fiscally sponsored by ${org.fiscalSponsor.name})` : ''}\nMISSION: ${org.mission || 'not given'}\nVISION: ${org.vision || 'not given'}\n\n${lines.join('\n\n')}`;
}

const VOICE = `You are a senior business plan consultant and grant writer who has helped hundreds of small businesses win SBA loans and community grants. You write in a confident, specific, professional voice: concrete numbers, short paragraphs, no hype, no filler. You never invent facts about the owner; where a fact is missing you write around it and list it as still needed. Figures from research are attributed to their source.`;

/** Claude review: gaps, follow-up questions and strategic recommendations. */
async function reviewPlan(org) {
  const answers = (org.businessPlanBuilder && org.businessPlanBuilder.answers) || {};
  return writeJson({
    system: VOICE,
    effort: 'high',
    prompt: `Review this owner's answers for a board game store with a youth after-school and guided gaming program. Act as both a grant reviewer and an SBA loan officer.

Return ONLY JSON:
{
  "readiness_score": 0-100,
  "summary": "2-3 sentences on where the plan stands",
  "strengths": ["..."],
  "gaps": [{"section": "section key", "issue": "what is weak or missing", "why_it_matters": "..."}],
  "follow_up_questions": [{"section": "section key", "question": "a specific question to ask the owner next"}],
  "recommendations": [{"priority": "high|medium|low", "area": "...", "message": "specific, actionable advice to strengthen the business or raise more money"}]
}

Section keys: ${SECTION_KEYS.join(', ')}

${planSnapshot(org)}`,
    mock: () => mockReview(org, answers)
  });
}

/** Market research for a section, using web search for local facts. */
async function researchSection(org, sectionKey) {
  const section = SECTIONS.find(s => s.key === sectionKey);
  if (!section) throw new Error(`Unknown section: ${sectionKey}`);
  const answers = (org.businessPlanBuilder && org.businessPlanBuilder.answers) || {};

  return writeJson({
    system: VOICE,
    webResearch: true,
    effort: 'high',
    prompt: `Research facts that will strengthen the "${section.title}" section of this business plan. Search the web for current, local, citable information: population and number of school-age kids in the area, household income, after-school program gaps, competing game stores and cafés, tabletop game industry growth, typical game store revenue per square foot and margins, research on tabletop games and youth social or academic outcomes, and typical local retail rents. Use what applies to this section.

Return ONLY JSON:
{
  "findings": [{"fact": "one specific fact with its number", "source": "publication or site name", "url": "source url", "use_in_plan": "how this supports the plan"}],
  "implications": ["what the research means for the owner's plan"],
  "suggested_answers": [{"question_id": "id from the list below", "suggestion": "text the owner could adopt or edit"}]
}

Question ids for this section: ${section.questions.map(q => `${q.id} (${q.prompt})`).join('; ')}

${planSnapshot(org)}`,
    mock: () => mockResearch(org, section)
  });
}

/** Write one section in a professional voice from the owner's answers. */
async function writeSection(org, sectionKey) {
  const section = SECTIONS.find(s => s.key === sectionKey);
  if (!section) throw new Error(`Unknown section: ${sectionKey}`);
  const builder = org.businessPlanBuilder || {};
  const research = (builder.research && builder.research[sectionKey]) || null;
  const written = org.businessPlan || {};

  const otherSections = sectionKey === 'executive_summary'
    ? SECTION_KEYS.filter(k => k !== 'executive_summary' && written[k]).map(k => `${k}: ${String(written[k]).slice(0, 1500)}`).join('\n\n')
    : '';

  return writeJson({
    system: VOICE,
    effort: 'high',
    prompt: `Write the "${section.title}" section of this business plan. It will be read by grant reviewers and SBA lenders, and reused across many applications.

Rules:
- 300-700 words, professional and specific, in the owner's first-person plural ("we").
- Use the owner's answers as the facts. Use research findings only where provided, and name their source.
- Do not invent numbers about the business. If one is needed and missing, write around it and list it under still_needed.
${section.key === 'youth_program' ? '- Frame the youth program for charitable funders: need, who is served, activities, measurable outcomes, safety, cost to families, and that it runs under a fiscal sponsor if one is named.\n' : ''}${section.key === 'financial_projections' ? '- Show the basis for every figure. Include a startup cost table and a simple year-one monthly summary in plain text if the answers allow.\n' : ''}
Return ONLY JSON:
{
  "text": "the finished section",
  "assumptions": ["assumptions you made that the owner should confirm"],
  "still_needed": ["facts that would make this section stronger"]
}

${planSnapshot(org)}
${research ? `\nRESEARCH FINDINGS:\n${JSON.stringify(research.findings || []).slice(0, 6000)}` : ''}
${otherSections ? `\nOTHER WRITTEN SECTIONS (summarize them for the executive summary):\n${otherSections}` : ''}`,
    mock: () => mockSection(org, section)
  });
}

// ─── Mock responses (USE_MOCK_API / no key) ─────────────────────────────────

function mockReview(org, answers) {
  const progress = completeness(answers);
  return {
    readiness_score: progress.percent,
    summary: `[MOCK] The plan is ${progress.percent}% complete on required questions.`,
    strengths: answered(answers.yp_activities) ? ['Clear description of youth program activities'] : [],
    gaps: progress.sections.filter(s => !s.ready_to_write).map(s => ({
      section: s.key, issue: `${s.missing_required.length} required question(s) unanswered`, why_it_matters: 'Reviewers look for this.'
    })),
    follow_up_questions: progress.sections.flatMap(s => s.missing_required.slice(0, 1).map(id => ({
      section: s.key, question: QUESTION_INDEX.get(id).prompt
    }))),
    recommendations: quickRecommendations(org, answers)
  };
}

function mockResearch(org, section) {
  return {
    findings: [{
      fact: `[MOCK] Research placeholder for ${section.title}.`,
      source: 'Mock data', url: null, use_in_plan: 'Replace with live research when CLAUDE_API_KEY is set.'
    }],
    implications: [],
    suggested_answers: [],
    _sources: []
  };
}

function mockSection(org, section) {
  const answers = (org.businessPlanBuilder && org.businessPlanBuilder.answers) || {};
  const body = section.questions
    .filter(q => answered(answers[q.id]))
    .map(q => answers[q.id])
    .join(' ');
  return {
    text: `[MOCK] ${section.title} for ${org.name || 'the business'}. ${body}`.trim(),
    assumptions: [],
    still_needed: section.questions.filter(q => q.required && !answered(answers[q.id])).map(q => q.prompt)
  };
}

module.exports = {
  SECTIONS,
  SECTION_KEYS,
  completeness,
  sanitizeAnswers,
  quickRecommendations,
  reviewPlan,
  researchSection,
  writeSection,
  planSnapshot
};
