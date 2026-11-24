/**
 * Small-business loan section: a catalog of programs that fit a startup
 * retail and community business, a readiness check against what lenders
 * actually ask for, and an AI-written lender packet built from the plan.
 *
 * Program terms change. Every program carries the official page to confirm
 * current limits and rates before applying; figures here are typical ranges
 * meant for planning, not quotes.
 */
const { writeJson } = require('./claudeWriter');

const LOAN_PROGRAMS = [
  {
    key: 'sba_microloan',
    name: 'SBA Microloan',
    lender_type: 'Nonprofit intermediary lenders (often CDFIs)',
    amount_min: 500,
    amount_max: 50000,
    typical_term: 'Up to 6 years',
    typical_rate: 'Usually around 8% to 13%',
    good_for: 'Startup inventory, furniture, fixtures, equipment and working capital for a first location',
    not_for: 'Buying real estate or paying off existing debt',
    startup_friendly: true,
    min_credit_score: 600,
    equity_expected_pct: 10,
    collateral: 'Usually required, plus a personal guarantee',
    includes_training: true,
    how_to_apply: 'Apply through an SBA-approved microlender in your area. Most require a business plan and a meeting with a loan advisor.',
    official_url: 'https://www.sba.gov/funding-programs/loans/microloans'
  },
  {
    key: 'sba_7a_small',
    name: 'SBA 7(a) Small Loan',
    lender_type: 'Banks and credit unions (SBA guaranteed)',
    amount_min: 25000,
    amount_max: 350000,
    typical_term: 'Up to 10 years for working capital and equipment, longer for real estate',
    typical_rate: 'Prime plus a capped spread, set by the lender',
    good_for: 'Build-out, opening inventory, equipment and working capital when you need more than a microloan',
    not_for: 'Owners with recent bankruptcies or no equity to contribute',
    startup_friendly: true,
    min_credit_score: 650,
    equity_expected_pct: 10,
    collateral: 'Lender takes available business assets; personal guarantee from 20%+ owners',
    includes_training: false,
    how_to_apply: 'Apply with an SBA-participating bank or credit union. SBA Lender Match (lendermatch.sba.gov) sends your request to interested lenders.',
    official_url: 'https://www.sba.gov/funding-programs/loans/7a-loans'
  },
  {
    key: 'sba_express',
    name: 'SBA Express',
    lender_type: 'Banks with SBA Express authority',
    amount_min: 10000,
    amount_max: 500000,
    typical_term: 'Up to 10 years, or a revolving line of credit',
    typical_rate: 'Prime plus a capped spread',
    good_for: 'A faster decision, or a line of credit for seasonal inventory',
    not_for: 'Owners who need a lot of lender guidance; the bank decides with less SBA review',
    startup_friendly: false,
    min_credit_score: 680,
    equity_expected_pct: 10,
    collateral: 'At the lender\'s discretion above smaller amounts',
    includes_training: false,
    how_to_apply: 'Ask your bank whether it offers SBA Express. Best once the store has some operating history.',
    official_url: 'https://www.sba.gov/funding-programs/loans/7a-loans'
  },
  {
    key: 'sba_504',
    name: 'SBA 504',
    lender_type: 'Certified Development Company plus a bank',
    amount_min: 125000,
    amount_max: 5500000,
    typical_term: '10, 20 or 25 years',
    typical_rate: 'Fixed, below market',
    good_for: 'Buying a building or major long-life equipment',
    not_for: 'Inventory, working capital or leased space build-out alone',
    startup_friendly: false,
    min_credit_score: 680,
    equity_expected_pct: 15,
    collateral: 'The property or equipment financed',
    includes_training: false,
    how_to_apply: 'Contact a Certified Development Company (CDC) serving Utah.',
    official_url: 'https://www.sba.gov/funding-programs/loans/504-loans'
  },
  {
    key: 'cdfi_small_business',
    name: 'CDFI Small Business Loan',
    lender_type: 'Community Development Financial Institutions',
    amount_min: 5000,
    amount_max: 250000,
    typical_term: '1 to 7 years',
    typical_rate: 'Varies; often flexible for startups and lower-income areas',
    good_for: 'Owners who do not yet qualify at a bank: thin credit, no business history, community-focused businesses',
    not_for: 'Very large projects',
    startup_friendly: true,
    min_credit_score: 575,
    equity_expected_pct: 5,
    collateral: 'Flexible; many accept less collateral than a bank',
    includes_training: true,
    how_to_apply: 'Search the CDFI Fund locator for Utah lenders and ask about startup retail loans.',
    official_url: 'https://www.cdfifund.gov/'
  },
  {
    key: 'utah_local_programs',
    name: 'Utah state and city business programs',
    lender_type: 'Utah agencies, city economic development offices and the Utah SBDC network',
    amount_min: 1000,
    amount_max: 100000,
    typical_term: 'Varies by program',
    typical_rate: 'Often below market; some programs are grants or forgivable',
    good_for: 'Local microenterprise loans, storefront and façade improvement funds, and small-business grants run by your city or county',
    not_for: 'Applying without first checking current funding rounds; many open and close each year',
    startup_friendly: true,
    min_credit_score: null,
    equity_expected_pct: null,
    collateral: 'Varies',
    includes_training: true,
    how_to_apply: 'Start with the Utah Small Business Development Center nearest you (free advising), and the economic development office of the city you open in.',
    official_url: 'https://business.utah.gov/'
  },
  {
    key: 'equipment_financing',
    name: 'Equipment and fixture financing',
    lender_type: 'Equipment lenders, vendors, banks',
    amount_min: 5000,
    amount_max: 150000,
    typical_term: '2 to 5 years',
    typical_rate: 'Varies widely with credit',
    good_for: 'Point-of-sale systems, tables, shelving and display fixtures, where the equipment is the collateral',
    not_for: 'Inventory or rent',
    startup_friendly: true,
    min_credit_score: 620,
    equity_expected_pct: 0,
    collateral: 'The equipment itself',
    includes_training: false,
    how_to_apply: 'Ask fixture and POS vendors about financing, or a bank about an equipment loan.',
    official_url: 'https://www.sba.gov/business-guide/plan-your-business/calculate-your-startup-costs'
  }
];

/** What lenders ask for, in the order they usually ask. */
const READINESS_CHECKS = [
  { key: 'business_plan', label: 'Written business plan', weight: 20 },
  { key: 'projections', label: 'Financial projections (3 years, monthly for year one)', weight: 15 },
  { key: 'credit', label: 'Owner credit score known', weight: 15 },
  { key: 'equity', label: 'Owner cash injection identified', weight: 15 },
  { key: 'use_of_funds', label: 'Itemized use of funds', weight: 10 },
  { key: 'tax_returns', label: 'Personal tax returns (last 3 years)', weight: 10 },
  { key: 'pfs', label: 'Personal financial statement (SBA Form 413)', weight: 10 },
  { key: 'experience', label: 'Relevant management or industry experience', weight: 5 }
];

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function planSectionsWritten(org) {
  const plan = org.businessPlan || {};
  return Object.values(plan).filter(v => typeof v === 'string' && v.trim().length > 100).length;
}

/** Readiness against the lender checklist, with what to do about each gap. */
function assessReadiness(org) {
  const lp = org.loanProfile || {};
  const amount = num(lp.amount_needed);
  const equity = num(lp.owner_equity);
  const credit = num(lp.owner_credit_score);
  const sections = planSectionsWritten(org);

  const status = {
    business_plan: sections >= 6,
    projections: Boolean(lp.has_projections) || Boolean((org.businessPlan || {}).financial_projections),
    credit: credit !== null,
    equity: equity !== null && equity > 0,
    use_of_funds: Array.isArray(lp.use_of_funds) && lp.use_of_funds.length > 0,
    tax_returns: Boolean(lp.has_tax_returns),
    pfs: Boolean(lp.has_personal_financial_statement),
    experience: num(lp.industry_experience_years) !== null || Boolean(org.trackRecord)
  };

  const fixes = {
    business_plan: `Finish the business plan builder (${sections} of 11 sections written).`,
    projections: 'Write the Financial Projections section, or upload projections your accountant prepared.',
    credit: 'Check your credit score for free through your bank or a credit bureau, and enter it.',
    equity: 'Decide how much of your own cash you can put in. Lenders typically want about 10% of the total project.',
    use_of_funds: 'List what the loan pays for: build-out, inventory, furniture, POS, working capital.',
    tax_returns: 'Gather your last three years of personal tax returns.',
    pfs: 'Fill out SBA Form 413 (Personal Financial Statement).',
    experience: 'Describe your management, retail or youth-program experience in your profile.'
  };

  let score = 0;
  const items = READINESS_CHECKS.map(c => {
    if (status[c.key]) score += c.weight;
    return { ...c, done: status[c.key], fix: status[c.key] ? null : fixes[c.key] };
  });

  const equityPct = amount && equity ? Math.round((equity / (amount + equity)) * 1000) / 10 : null;

  return {
    score,
    items,
    amount_needed: amount,
    owner_equity: equity,
    equity_pct_of_project: equityPct,
    credit_score: credit
  };
}

/** How well each program fits this owner and amount, with reasons. */
function rankPrograms(org) {
  const lp = org.loanProfile || {};
  const amount = num(lp.amount_needed);
  const credit = num(lp.owner_credit_score);
  const months = num(lp.months_in_business) || 0;
  const readiness = assessReadiness(org);
  const ownsOrBuysProperty = Boolean(lp.buying_property);

  return LOAN_PROGRAMS.map(p => {
    const reasons = [];
    const cautions = [];
    let fit = 50;

    if (amount !== null) {
      if (amount >= p.amount_min && amount <= p.amount_max) { fit += 20; reasons.push('Covers the amount you need'); }
      else if (amount > p.amount_max) { fit -= 15; cautions.push(`Tops out at $${p.amount_max.toLocaleString()}; could cover part of the need`); }
      else { fit -= 25; cautions.push(`Minimum is about $${p.amount_min.toLocaleString()}`); }
    }
    if (months < 24) {
      if (p.startup_friendly) { fit += 15; reasons.push('Works with startups'); }
      else { fit -= 20; cautions.push('Usually wants two or more years in business'); }
    }
    if (credit !== null && p.min_credit_score) {
      if (credit >= p.min_credit_score) { fit += 10; reasons.push('Your credit score is in range'); }
      else { fit -= 20; cautions.push(`Lenders here often look for ${p.min_credit_score}+ credit`); }
    }
    if (p.key === 'sba_504' && !ownsOrBuysProperty) { fit -= 30; cautions.push('Only makes sense for buying a building or major equipment'); }
    if (p.includes_training) reasons.push('Comes with free advising or training');
    if (p.equity_expected_pct && readiness.equity_pct_of_project !== null && readiness.equity_pct_of_project < p.equity_expected_pct) {
      cautions.push(`Plan on about ${p.equity_expected_pct}% owner cash; you have ${readiness.equity_pct_of_project}%`);
      fit -= 5;
    }

    return { ...p, fit_score: Math.max(0, Math.min(100, fit)), reasons, cautions };
  }).sort((a, b) => b.fit_score - a.fit_score);
}

/** A lender-ready packet written from the plan and loan profile. */
async function generateLoanPackage(org, { programKey, lenderName, amount } = {}) {
  const program = LOAN_PROGRAMS.find(p => p.key === programKey) || null;
  const lp = org.loanProfile || {};
  const plan = org.businessPlan || {};
  const readiness = assessReadiness(org);
  const ask = num(amount) || num(lp.amount_needed);

  return writeJson({
    system: 'You are a former SBA loan officer who now writes loan request packages for small businesses. You write plainly and precisely, the way underwriters like: numbers first, every figure explained, risks acknowledged with mitigations. You never invent figures; missing numbers go in still_needed.',
    effort: 'high',
    prompt: `Write a loan request package for this business.

LOAN: ${program ? `${program.name} (${program.lender_type})` : 'Small business loan'}${lenderName ? ` with ${lenderName}` : ''}
AMOUNT REQUESTED: ${ask ? `$${ask.toLocaleString()}` : 'not set'}
LOAN PROFILE: ${JSON.stringify(lp)}
READINESS: score ${readiness.score}/100; missing: ${readiness.items.filter(i => !i.done).map(i => i.label).join(', ') || 'none'}

BUSINESS: ${org.name || 'Unnamed'} — ${org.mission || ''}
BUSINESS PLAN:
${Object.entries(plan).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => `${k}: ${v}`).join('\n\n') || '(no plan sections yet)'}

Return ONLY JSON:
{
  "cover_letter": "one-page letter to the lender requesting the loan",
  "loan_request_summary": "amount, term sought, purpose, and how it will be repaid",
  "use_of_funds": [{"item": "...", "amount": 0, "note": "..."}],
  "repayment_ability": "how cash flow covers the payment, with the numbers available",
  "owner_contribution_and_collateral": "...",
  "management_summary": "...",
  "risks_and_mitigations": "...",
  "community_impact": "jobs created and the youth program's benefit, briefly",
  "document_checklist": ["documents the lender will want"],
  "still_needed": ["facts or documents missing from this package"]
}`,
    mock: () => ({
      cover_letter: `[MOCK] Loan request from ${org.name || 'the business'}${lenderName ? ` to ${lenderName}` : ''}.`,
      loan_request_summary: `[MOCK] Requesting ${ask ? `$${ask.toLocaleString()}` : 'an amount to be set'}.`,
      use_of_funds: (lp.use_of_funds || []).map(u => (typeof u === 'string' ? { item: u, amount: null, note: '' } : u)),
      repayment_ability: '[MOCK]',
      owner_contribution_and_collateral: '[MOCK]',
      management_summary: '[MOCK]',
      risks_and_mitigations: '[MOCK]',
      community_impact: '[MOCK]',
      document_checklist: READINESS_CHECKS.map(c => c.label),
      still_needed: readiness.items.filter(i => !i.done).map(i => i.label)
    })
  });
}

const LOAN_STATUSES = ['researching', 'preparing', 'submitted', 'in_underwriting', 'approved', 'declined', 'funded', 'withdrawn'];

module.exports = {
  LOAN_PROGRAMS,
  LOAN_STATUSES,
  READINESS_CHECKS,
  assessReadiness,
  rankPrograms,
  generateLoanPackage
};
