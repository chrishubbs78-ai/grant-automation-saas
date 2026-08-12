/**
 * Grants.gov discovery client.
 *
 * Two public endpoints, no API key required:
 *   search2          — paged listings (thin: title/agency/dates only)
 *   fetchOpportunity — full synopsis for one opportunity (description,
 *                      eligibility, award amounts)
 *
 * The split matters for cost and politeness: we list broadly, pre-filter
 * locally, and only fetch full detail for opportunities that survive.
 */

const logger = require('../utils/logger');
const { getMockOpportunities } = require('./mockApiService');

const BASE_URL = process.env.GRANTS_GOV_BASE_URL || 'https://api.grants.gov/v1/api';
const REQUEST_TIMEOUT_MS = parseInt(process.env.GRANTS_GOV_TIMEOUT_MS || '20000', 10);

// Discovery is mocked under the same flag as the rest of the app so the whole
// system is explorable without network access or keys.
const USE_MOCK = process.env.USE_MOCK_API === 'true';

/** Grants.gov returns MM/DD/YYYY; empty strings mean "not specified". */
function parseGovDate(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    const loose = new Date(value);
    return isNaN(loose.getTime()) ? null : loose;
  }
  const [, month, day, year] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`Grants.gov ${path} returned HTTP ${res.status}`);
    }
    const json = await res.json();
    // The API signals failures in-band with a non-zero errorcode and HTTP 200.
    if (json.errorcode && json.errorcode !== 0) {
      throw new Error(`Grants.gov ${path} error ${json.errorcode}: ${json.msg || 'unknown'}`);
    }
    return json.data || {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search for opportunities. Returns thin listing records.
 * @param {object} opts
 * @param {string} opts.keyword       - free-text search
 * @param {number} opts.rows          - max results (Grants.gov caps this)
 * @param {string} opts.oppStatuses   - pipe-delimited: "posted|forecasted"
 * @param {string[]} opts.eligibilities - applicant type codes
 */
async function searchOpportunities({
  keyword = '',
  rows = 50,
  oppStatuses = 'posted|forecasted',
  eligibilities = [],
  fundingCategories = []
} = {}) {
  if (USE_MOCK) {
    logger.info('[MOCK] Returning mock Grants.gov search results');
    return getMockOpportunities(keyword).map(normalizeSearchHit);
  }

  const data = await postJson('search2', {
    keyword,
    rows,
    oppStatuses,
    eligibilities: eligibilities.join('|'),
    fundingCategories: fundingCategories.join('|')
  });

  const hits = data.oppHits || [];
  logger.info({ keyword, hitCount: data.hitCount, returned: hits.length }, 'Grants.gov search complete');
  return hits.map(normalizeSearchHit);
}

/** Map a thin search hit onto our GrantOpportunity shape. */
function normalizeSearchHit(hit) {
  return {
    source: 'grants_gov',
    source_id: String(hit.id),
    opportunity_number: hit.number || null,
    title: hit.title || 'Untitled opportunity',
    agency: hit.agency || hit.agencyName || null,
    agency_code: hit.agencyCode || null,
    open_date: parseGovDate(hit.openDate),
    close_date: parseGovDate(hit.closeDate),
    opportunity_status: (hit.oppStatus || 'posted').toLowerCase(),
    source_url: hit.id ? `https://www.grants.gov/search-results-detail/${hit.id}` : null,
    raw: hit
  };
}

/**
 * Fetch the full synopsis for one opportunity and merge it into the record.
 * Detail failures are non-fatal — a thin record still matches on title/agency,
 * so one bad opportunity must not abort a whole discovery run.
 */
async function fetchOpportunityDetail(sourceId) {
  if (USE_MOCK) return {};

  try {
    const data = await postJson('fetchOpportunity', { opportunityId: Number(sourceId) });
    const synopsis = data.synopsis || {};

    return {
      description: stripHtml(synopsis.synopsisDesc || ''),
      eligibility_text: stripHtml(synopsis.applicantEligibilityDesc || ''),
      eligibility_codes: (synopsis.applicantTypes || [])
        .map(t => (typeof t === 'string' ? t : t.id))
        .filter(Boolean)
        .map(String),
      award_floor: toNumber(synopsis.awardFloor),
      award_ceiling: toNumber(synopsis.awardCeiling),
      total_funding: toNumber(synopsis.estimatedFunding),
      expected_awards: synopsis.expectedNumberOfAwards
        ? parseInt(synopsis.expectedNumberOfAwards, 10)
        : null,
      cost_sharing_required: Boolean(synopsis.costSharing),
      category: (data.opportunityCategory && data.opportunityCategory.description) || null
    };
  } catch (error) {
    logger.warn({ sourceId, error: error.message }, 'Could not fetch opportunity detail; keeping listing-level data');
    return {};
  }
}

/** Synopsis fields arrive as HTML fragments; matching wants readable text. */
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  searchOpportunities,
  fetchOpportunityDetail,
  normalizeSearchHit,
  parseGovDate,
  stripHtml
};
