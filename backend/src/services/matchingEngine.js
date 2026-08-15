/**
 * Two-stage opportunity matching.
 *
 *   Stage 1 (free, local)  — deterministic disqualifiers: deadline lead time,
 *                            eligibility codes, award size vs capacity.
 *   Stage 2 (costs tokens) — one batched Claude call scoring the survivors on
 *                            mission fit.
 *
 * The staging exists because stage 2 is the only part that costs money. A
 * discovery run over 200 opportunities should score ~15, not 200 — and the
 * ones it drops are dropped for reasons a human would agree with on sight
 * (deadline already passed, wrong applicant type, award 40x the org's budget).
 */

const { GrantOpportunity, OpportunityMatch, Organization } = require('../models');
const { searchOpportunities, fetchOpportunityDetail } = require('./grantsGovService');
const { getUtahFunders } = require('./utahFunderDirectory');
const { findGrantmakers } = require('./propublicaService');
const { scoreOpportunityMatches } = require('./claudeService');
const logger = require('../utils/logger');

/**
 * Points added for geographic proximity. A statewide funder draws from every
 * nonprofit in one state; a national program draws from all fifty. Same effort,
 * very different odds — so local money is worth surfacing above a federal
 * program of equal mission fit.
 */
const LOCALITY_BOOST = { city: 20, county: 20, state: 15, regional: 8, national: 0 };

/** In-state directories to consult, keyed by the org's own state. */
const STATE_DIRECTORIES = { UT: getUtahFunders };

/**
 * NTEE major groups worth searching for an org, inferred from its mission.
 * An empty list means "do not filter by field" rather than "match nothing".
 */
const NTEE_KEYWORDS = {
  B: ['education', 'school', 'student', 'literacy', 'tutoring', 'stem', 'academic', 'learning'],
  O: ['youth', 'mentoring', 'mentorship', 'teen', 'adolescent', 'after-school', 'afterschool'],
  P: ['human services', 'family', 'families', 'poverty', 'homeless', 'welfare', 'childcare'],
  E: ['health', 'clinic', 'medical', 'wellness'],
  F: ['mental health', 'counseling', 'behavioral', 'crisis'],
  A: ['arts', 'music', 'theater', 'theatre', 'museum', 'cultural', 'dance'],
  K: ['food', 'nutrition', 'hunger', 'meals', 'pantry'],
  L: ['housing', 'shelter', 'rent', 'homelessness'],
  J: ['workforce', 'employment', 'job training', 'career'],
  C: ['environment', 'conservation', 'watershed', 'climate', 'habitat'],
  N: ['recreation', 'sports', 'athletic', 'camp'],
  S: ['community development', 'neighborhood', 'economic development']
};

function nteeFieldsFor(org) {
  const text = [
    org.mission, org.problemStatement, org.targetPopulation,
    ...(org.programsAndServices || []).map(p => `${p.name} ${p.description}`)
  ].filter(Boolean).join(' ').toLowerCase();

  if (!text.trim()) return [];

  const fields = Object.entries(NTEE_KEYWORDS)
    .filter(([, words]) => words.some(w => text.includes(w)))
    .map(([letter]) => letter);

  // T = philanthropy/grantmaking. Many family foundations classify themselves
  // there regardless of what they fund, so always keep them in scope.
  return fields.length > 0 ? [...new Set([...fields, 'T'])] : [];
}

/** Compare funder names across sources without punctuation or legal suffixes. */
function normalizeFunderName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(the|inc|llc|foundation|trust|fund|charitable|family|endowment)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Applying takes real work; anything closing sooner than this isn't actionable.
const MIN_LEAD_DAYS = parseInt(process.env.MATCH_MIN_LEAD_DAYS || '10', 10);
// How many survivors get AI-scored per run. The main cost dial.
const MAX_SCORED = parseInt(process.env.MATCH_MAX_SCORED || '15', 10);
// Award ceiling beyond this multiple of annual budget signals a different
// weight class of applicant — a $1M org rarely wins a $40M award.
const MAX_AWARD_BUDGET_MULTIPLE = parseFloat(process.env.MATCH_MAX_AWARD_MULTIPLE || '5');

/**
 * Grants.gov applicant-type codes an org can plausibly claim.
 * 12 = 501(c)(3) nonprofits, 13 = non-501(c)(3) nonprofits, 25 = "Others",
 * 99 = Unrestricted, 00-07 = government tiers.
 */
function eligibleApplicantCodes(org) {
  switch (org.taxExemptStatus) {
    case '501c3': return ['12', '25', '99'];
    case '501c4': return ['13', '25', '99'];
    case 'fiscally_sponsored': return ['12', '13', '25', '99'];
    case 'government': return ['00', '01', '02', '04', '07', '25', '99'];
    default: return ['25', '99'];
  }
}

/**
 * Stage 1. Returns {passed, checks} — `checks` is retained on the match row so
 * a user can always see why something was filtered out rather than guessing.
 */
function prefilter(opportunity, org) {
  const checks = {};
  const now = Date.now();

  // Deadline must leave enough runway to actually produce an application.
  if (opportunity.close_date) {
    const daysOut = Math.floor((new Date(opportunity.close_date).getTime() - now) / 86400000);
    checks.deadline = {
      passed: daysOut >= MIN_LEAD_DAYS,
      days_until_close: daysOut,
      reason: daysOut < 0
        ? 'Deadline has passed'
        : daysOut < MIN_LEAD_DAYS
          ? `Only ${daysOut} days until close — less than the ${MIN_LEAD_DAYS}-day minimum`
          : null
    };
  } else {
    // No stated deadline usually means rolling; not a disqualifier.
    checks.deadline = { passed: true, days_until_close: null, reason: null };
  }

  // Eligibility: only disqualify on a positive mismatch. An empty code list
  // means the source didn't say, which is not the same as "not eligible".
  const oppCodes = (opportunity.eligibility_codes || []).map(String);
  if (oppCodes.length > 0) {
    const orgCodes = eligibleApplicantCodes(org);
    const overlap = oppCodes.filter(c => orgCodes.includes(c));
    checks.eligibility = {
      passed: overlap.length > 0,
      matched_codes: overlap,
      reason: overlap.length === 0
        ? `Open to applicant types [${oppCodes.join(', ')}], which excludes a ${org.taxExemptStatus || 'nonprofit'} applicant`
        : null
    };
  } else {
    checks.eligibility = { passed: true, matched_codes: [], reason: null };
  }

  // Award size sanity — only applied when we know both numbers.
  const budget = parseFloat(org.annualBudget) || null;
  const ceiling = parseFloat(opportunity.award_ceiling) || null;
  if (budget && ceiling) {
    const multiple = ceiling / budget;
    checks.award_size = {
      passed: multiple <= MAX_AWARD_BUDGET_MULTIPLE,
      award_to_budget_multiple: Math.round(multiple * 10) / 10,
      reason: multiple > MAX_AWARD_BUDGET_MULTIPLE
        ? `Award ceiling is ${multiple.toFixed(1)}x your annual budget — typically awarded to much larger organizations`
        : null
    };
  } else {
    checks.award_size = { passed: true, award_to_budget_multiple: null, reason: null };
  }

  // Geography: a funder that only serves other states is a hard no, however
  // well the mission lines up. Only disqualify on a stated, non-matching list.
  const orgState = orgHomeState(org);
  const eligibleStates = (opportunity.eligible_states || []).map(s => String(s).toUpperCase());
  if (eligibleStates.length > 0 && orgState) {
    const allowed = eligibleStates.includes(orgState);
    checks.geography = {
      passed: allowed,
      org_state: orgState,
      funder_states: eligibleStates,
      reason: allowed ? null
        : `Funds only ${eligibleStates.join(', ')} — your organization is in ${orgState}`
    };
  } else {
    checks.geography = { passed: true, org_state: orgState, funder_states: eligibleStates, reason: null };
  }

  const passed = Object.values(checks).every(c => c.passed);
  return { passed, checks };
}

/** The org's home state, from its address. Null when not filled in yet. */
function orgHomeState(org) {
  const raw = (org.address && org.address.state) || org.state || null;
  return raw ? String(raw).trim().toUpperCase().slice(0, 2) : null;
}

/**
 * Local-preference boost. Returns points and the reason, kept separate from the
 * model's score so the adjustment shows up in the UI rather than silently
 * inflating a number the user can't account for.
 */
function localityBoost(opportunity, org) {
  const orgState = orgHomeState(org);
  if (!orgState) return { points: 0, reason: null };

  const states = (opportunity.eligible_states || []).map(s => String(s).toUpperCase());
  const isLocal = states.includes(orgState);
  if (!isLocal) return { points: 0, reason: null };

  const scope = opportunity.geographic_scope || 'national';
  const points = LOCALITY_BOOST[scope] || 0;
  if (points === 0) return { points: 0, reason: null };

  const where = opportunity.service_area || `${orgState}`;
  return {
    points,
    reason: `+${points} local preference — ${scope}-level funder serving ${where}, `
      + 'a far smaller applicant pool than national programs.'
  };
}

/** Search terms derived from the org profile, so discovery reflects the org. */
function buildSearchTerms(org) {
  const explicit = (org.constraints && org.constraints.search_keywords) || [];
  if (explicit.length > 0) return explicit.slice(0, 5);

  const terms = [];
  const programNames = (org.programsAndServices || []).map(p => p.name).filter(Boolean);
  if (programNames.length) terms.push(...programNames.slice(0, 2));

  // Fall back to the most distinctive words in the mission statement.
  if (terms.length < 2 && org.mission) {
    const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'our', 'are', 'from', 'their', 'who', 'all', 'help', 'through', 'provide', 'providing']);
    const words = (org.mission.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w));
    terms.push(...[...new Set(words)].slice(0, 3));
  }

  return terms.length ? terms : [''];
}

/** Upsert on (source, source_id) so repeated runs refresh instead of duplicate. */
async function upsertOpportunity(record) {
  const existing = await GrantOpportunity.findOne({
    where: { source: record.source, source_id: record.source_id }
  });

  if (existing) {
    await existing.update({ ...record, last_seen_at: new Date() });
    return { opportunity: existing, created: false };
  }

  const created = await GrantOpportunity.create({ ...record, last_seen_at: new Date() });
  return { opportunity: created, created: true };
}

/**
 * Full discovery run for one organization.
 * @returns {Promise<{discovered:number,new:number,prefiltered:number,scored:number,matches:Array}>}
 */
async function runDiscovery(orgId, { keywords = null, maxScored = MAX_SCORED } = {}) {
  const org = await Organization.findByPk(orgId);
  if (!org) throw new Error('Organization not found');

  const terms = keywords && keywords.length ? keywords : buildSearchTerms(org);
  logger.info({ orgId, terms }, 'Starting opportunity discovery');

  // 1. Search each term, dedupe by source_id across terms.
  const seen = new Map();
  const sourceErrors = [];
  for (const term of terms) {
    try {
      const hits = await searchOpportunities({ keyword: term, rows: 50 });
      for (const hit of hits) {
        if (!seen.has(hit.source_id)) seen.set(hit.source_id, hit);
      }
    } catch (error) {
      // One failed search term must not sink the run — but the failure has to
      // be reported. "0 results" and "the source was unreachable" look
      // identical to a user otherwise, and only one of them is their problem.
      logger.warn({ term, error: error.message }, 'Opportunity search failed for term');
      sourceErrors.push({ term, error: error.message });
    }
  }
  // In-state funders. These come from a curated directory rather than an API —
  // no state publishes one — so they cost nothing to include and are usually
  // the best odds on the list.
  const orgState = orgHomeState(org);
  const directoryFor = orgState ? STATE_DIRECTORIES[orgState] : null;
  const curatedNames = [];
  if (directoryFor) {
    for (const entry of directoryFor()) {
      if (!seen.has(entry.source_id)) seen.set(entry.source_id, entry);
      curatedNames.push(normalizeFunderName(entry.agency));
    }
    logger.info({ orgState }, 'Included in-state funder directory');
  }

  // IRS 990 grantmakers in the same state — foundations that actually paid
  // grants, ranked by how much. Skipped when the org has no address, since
  // there is no state to search.
  if (orgState) {
    try {
      const grantmakers = await findGrantmakers({
        state: orgState,
        fields: nteeFieldsFor(org),
        limit: parseInt(process.env.PROPUBLICA_LIMIT || '20', 10)
      });
      for (const entry of grantmakers) {
        // A hand-verified directory entry beats a generic 990 record for the
        // same funder — keep the curated one and drop the duplicate.
        if (curatedNames.includes(normalizeFunderName(entry.agency))) continue;
        if (!seen.has(entry.source_id)) seen.set(entry.source_id, entry);
      }
      logger.info({ orgState, added: grantmakers.length }, 'Included IRS 990 grantmakers');
    } catch (error) {
      logger.warn({ error: error.message }, 'ProPublica lookup failed; continuing without it');
      sourceErrors.push({ term: 'propublica_990', error: error.message });
    }
  }

  const listings = [...seen.values()];

  // 2. Persist listings, skipping ones already dismissed or converted — a
  //    dismissed opportunity should stay dismissed across runs.
  const stored = [];
  let newCount = 0;
  for (const listing of listings) {
    const { opportunity, created } = await upsertOpportunity(listing);
    if (created) newCount++;

    const existingMatch = await OpportunityMatch.findOne({
      where: { org_id: orgId, opportunity_id: opportunity.id }
    });
    if (existingMatch && ['dismissed', 'converted'].includes(existingMatch.status)) continue;

    stored.push({ opportunity, existingMatch });
  }

  // 3. Stage 1 — free prefilter. Failures are recorded, not discarded, so the
  //    user can see what was rejected and why.
  const survivors = [];
  for (const entry of stored) {
    const { passed, checks } = prefilter(entry.opportunity, org);
    if (passed) {
      survivors.push(entry);
    } else {
      await recordMatch(orgId, entry, {
        fit_score: null,
        eligibility_verdict: checks.eligibility.passed ? 'unknown' : 'ineligible',
        rationale: Object.values(checks).map(c => c.reason).filter(Boolean).join(' '),
        key_alignment: [],
        concerns: []
      }, checks, 'dismissed');
    }
  }

  // 4. Fetch full detail only for survivors — the expensive-ish network step.
  const toScore = survivors.slice(0, maxScored);
  for (const entry of toScore) {
    if (!entry.opportunity.description) {
      const detail = await fetchOpportunityDetail(entry.opportunity.source_id);
      if (Object.keys(detail).length > 0) await entry.opportunity.update(detail);
    }
  }

  // 5. Stage 2 — one batched scoring call for all survivors.
  let scores = [];
  if (toScore.length > 0) {
    try {
      scores = await scoreOpportunityMatches({
        orgProfile: org.get({ plain: true }),
        opportunities: toScore.map(e => e.opportunity.get({ plain: true }))
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Opportunity scoring failed; storing unscored matches');
    }
  }

  const matches = [];
  for (let i = 0; i < toScore.length; i++) {
    const score = scores.find(s => s.index === i) || {};
    const { checks } = prefilter(toScore[i].opportunity, org);
    const boost = localityBoost(toScore[i].opportunity, org);

    if (boost.points > 0 && typeof score.fit_score === 'number') {
      score.fit_score = Math.min(100, score.fit_score + boost.points);
      score.key_alignment = [boost.reason, ...(score.key_alignment || [])];
    }

    const match = await recordMatch(orgId, toScore[i], score, checks, null, boost.points);
    matches.push(match);
  }

  // Rank before returning. The HTTP route sorts in SQL, but callers of this
  // function directly (scheduler, tests, scripts) get the array as-is and
  // would otherwise receive it in arbitrary insertion order.
  matches.sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));

  const result = {
    discovered: listings.length,
    new: newCount,
    prefiltered: stored.length - survivors.length,
    scored: matches.length,
    // Every search term failing means the source is down or blocked, not that
    // there is nothing out there — the caller must be able to tell them apart.
    source_unreachable: sourceErrors.length === terms.length,
    source_errors: sourceErrors,
    matches
  };
  logger.info({ orgId, ...result, matches: undefined }, 'Discovery run complete');
  return result;
}

/** Create or refresh one org's verdict on one opportunity. */
async function recordMatch(orgId, entry, score, checks, forcedStatus, localBoost = 0) {
  const payload = {
    fit_score: typeof score.fit_score === 'number' ? score.fit_score : null,
    eligibility_verdict: score.eligibility_verdict || 'unknown',
    rationale: score.rationale || null,
    key_alignment: score.key_alignment || [],
    concerns: score.concerns || [],
    prefilter_result: checks,
    local_boost: localBoost,
    scored_at: new Date()
  };

  if (entry.existingMatch) {
    // Preserve a user's 'reviewed' state across rescoring; only auto-set status
    // when the caller forces it (prefilter rejection).
    await entry.existingMatch.update({
      ...payload,
      ...(forcedStatus ? { status: forcedStatus } : {})
    });
    return entry.existingMatch;
  }

  return OpportunityMatch.create({
    org_id: orgId,
    opportunity_id: entry.opportunity.id,
    status: forcedStatus || 'new',
    ...payload
  });
}

module.exports = {
  runDiscovery,
  prefilter,
  buildSearchTerms,
  eligibleApplicantCodes,
  localityBoost,
  orgHomeState,
  nteeFieldsFor,
  normalizeFunderName,
  MIN_LEAD_DAYS,
  MAX_SCORED,
  LOCALITY_BOOST
};
