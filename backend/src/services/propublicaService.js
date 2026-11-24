/**
 * ProPublica Nonprofit Explorer — IRS 990 data.
 *
 * Free, no API key. Indexes 990, 990-EZ, and 990-PF filings for roughly
 * 100,000 private foundations.
 *
 * Why this matters more than a funder directory: a directory lists who a
 * foundation *says* it funds. A 990-PF is what it actually paid out, filed
 * under penalty of perjury. This turns "here are Utah foundations" into "here
 * are Utah foundations that granted $X last year and work in your field."
 *
 * What this gives you, honestly:
 *   ✓ Which Utah foundations exist, their EIN, assets, and total grants paid
 *   ✓ NTEE classification, so you can filter to your field
 *   ✗ NOT the recipient-by-recipient grant list — that lives in Part XV of the
 *     filing itself, which the API links to but does not return as structured
 *     data. We link straight to it.
 *
 * Grant totals lag 1–2 years behind, since they come from filed tax returns.
 * Use this for targeting, never for deadlines.
 */

const logger = require('../utils/logger');
const { getMockPropublicaOrgs } = require('./mockApiService');

const BASE_URL = process.env.PROPUBLICA_BASE_URL || 'https://projects.propublica.org/nonprofits/api/v2';
const REQUEST_TIMEOUT_MS = parseInt(process.env.PROPUBLICA_TIMEOUT_MS || '20000', 10);
const USE_MOCK = process.env.USE_MOCK_API === 'true';

/**
 * NTEE major groups worth surfacing, mapped to plain language. The first
 * letter of an NTEE code is the field; that is all we need to filter on.
 */
const NTEE_FIELDS = {
  A: 'Arts, culture, humanities',
  B: 'Education',
  C: 'Environment',
  D: 'Animal-related',
  E: 'Health care',
  F: 'Mental health & crisis intervention',
  G: 'Disease & disorders',
  H: 'Medical research',
  I: 'Crime & legal',
  J: 'Employment',
  K: 'Food, agriculture & nutrition',
  L: 'Housing & shelter',
  M: 'Public safety & disaster relief',
  N: 'Recreation & sports',
  O: 'Youth development',
  P: 'Human services',
  Q: 'International affairs',
  R: 'Civil rights & advocacy',
  S: 'Community improvement',
  T: 'Philanthropy & grantmaking',
  U: 'Science & technology',
  V: 'Social science',
  W: 'Public & societal benefit',
  X: 'Religion-related',
  Y: 'Mutual benefit',
  Z: 'Unknown'
};

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`ProPublica ${path} returned HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Search foundations in a state.
 * @param {object} opts
 * @param {string} opts.state    - USPS code, e.g. 'UT'
 * @param {string} opts.query    - optional free-text
 * @param {number} opts.pages    - how many result pages to walk (25 per page)
 */
async function searchFoundations({ state = 'UT', query = '', pages = 2 } = {}) {
  if (USE_MOCK) {
    logger.info('[MOCK] Returning mock ProPublica foundation results');
    return getMockPropublicaOrgs(state);
  }

  const results = [];
  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({ 'state[id]': state, page: String(page) });
    if (query) params.set('q', query);

    try {
      const data = await getJson(`search.json?${params.toString()}`);
      const orgs = data.organizations || [];
      results.push(...orgs);
      // Stop early rather than walking empty pages.
      if (orgs.length === 0) break;
    } catch (error) {
      logger.warn({ page, error: error.message }, 'ProPublica search page failed');
      break;
    }
  }
  return results;
}

/** Full record for one EIN, including filing financials. */
async function getOrganization(ein) {
  if (USE_MOCK) return null;
  try {
    return await getJson(`organizations/${ein}.json`);
  } catch (error) {
    logger.warn({ ein, error: error.message }, 'Could not fetch ProPublica organization detail');
    return null;
  }
}

/**
 * Pull the most useful numbers out of a filings list. Field names vary across
 * form types and years, so each is tried in order of preference and anything
 * missing simply stays null rather than throwing.
 */
function summarizeFilings(org) {
  const filings = (org && org.filings_with_data) || [];
  if (filings.length === 0) return { grants_paid: null, assets: null, revenue: null, tax_year: null };

  // Most recent first — the API returns them descending, but do not rely on it.
  const latest = [...filings].sort((a, b) => (b.tax_prd_yr || 0) - (a.tax_prd_yr || 0))[0];

  return {
    grants_paid: toNumber(latest.grntspaid ?? latest.grnsttoindiv ?? null),
    assets: toNumber(latest.totassetsend ?? latest.totassetsavg ?? null),
    revenue: toNumber(latest.totrevenue ?? latest.totrevnue ?? null),
    tax_year: latest.tax_prd_yr || null
  };
}

/** True when a foundation's NTEE field plausibly overlaps the org's work. */
function fieldMatches(nteeCode, wantedFields) {
  if (!nteeCode || wantedFields.length === 0) return true;
  return wantedFields.includes(String(nteeCode).trim().charAt(0).toUpperCase());
}

/**
 * Normalize a ProPublica organization into our GrantOpportunity shape.
 * These are directory records: real funders, no deadline, no invented amounts.
 */
function normalizeFoundation(org, summary = {}) {
  const field = NTEE_FIELDS[String(org.ntee_code || '').charAt(0).toUpperCase()];
  const parts = [];

  if (field) parts.push(`Field: ${field} (NTEE ${org.ntee_code}).`);
  if (summary.grants_paid) {
    parts.push(`Paid $${summary.grants_paid.toLocaleString()} in grants in ${summary.tax_year || 'its latest filing'}.`);
  }
  if (summary.assets) parts.push(`Assets $${summary.assets.toLocaleString()}.`);
  parts.push(
    'Figures come from IRS filings and lag 1–2 years. The filing itself lists every '
    + 'grant made and to whom — open it to see whether they fund work like yours, '
    + 'then contact them for current guidelines.'
  );

  return {
    source: 'propublica_990',
    source_id: `ein-${org.ein}`,
    opportunity_number: `EIN ${org.ein}`,
    title: org.name || `EIN ${org.ein}`,
    agency: org.name || null,
    agency_code: String(org.ein),
    description: parts.join(' '),
    open_date: null,
    close_date: null, // foundations are rolling; a deadline here would be fabricated
    award_floor: null,
    award_ceiling: null,
    total_funding: summary.grants_paid || null,
    expected_awards: null,
    cost_sharing_required: false,
    eligibility_codes: ['12'], // private foundations fund 501(c)(3) organizations
    eligibility_text: 'Private foundation. Confirm eligibility and process directly with the funder.',
    category: field || null,
    geographic_scope: 'state',
    eligible_states: [String(org.state || 'UT').toUpperCase()],
    service_area: `${org.city ? org.city + ', ' : ''}${org.state || ''}`.trim() || null,
    opportunity_status: 'directory',
    source_url: `https://projects.propublica.org/nonprofits/organizations/${org.ein}`,
    raw: {
      verified: true, // the EIN and figures are from filed tax returns
      url_kind: 'official',
      ein: org.ein,
      ntee_code: org.ntee_code || null,
      ...summary
    }
  };
}

/**
 * Find grantmaking foundations in a state, ranked by how much they actually
 * grant. Only foundations that paid grants are returned — a foundation with no
 * grants paid is not a funding prospect, whatever its assets.
 *
 * @param {object} opts
 * @param {string} opts.state
 * @param {string[]} opts.fields   - NTEE first letters to keep, e.g. ['B','O','P']
 * @param {number} opts.minGrants  - ignore foundations granting less than this
 * @param {number} opts.limit      - how many to return
 */
async function findGrantmakers({ state = 'UT', fields = [], minGrants = 25000, limit = 25 } = {}) {
  const orgs = await searchFoundations({ state });

  // Cheap filters first — NTEE field and obvious non-grantmakers — so detail
  // requests are only spent on plausible candidates.
  const candidates = orgs.filter(o => fieldMatches(o.ntee_code, fields));

  const enriched = [];
  for (const org of candidates.slice(0, limit * 3)) {
    const detail = USE_MOCK ? { filings_with_data: org.filings_with_data } : await getOrganization(org.ein);
    const summary = summarizeFilings(detail || {});

    // No grants paid means not a funding prospect, however large the endowment.
    if (summary.grants_paid !== null && summary.grants_paid < minGrants) continue;
    if (summary.grants_paid === null && !USE_MOCK) continue;

    enriched.push(normalizeFoundation(org, summary));
    if (enriched.length >= limit) break;
  }

  enriched.sort((a, b) => (b.total_funding || 0) - (a.total_funding || 0));
  logger.info({ state, found: orgs.length, returned: enriched.length }, 'ProPublica grantmaker search complete');
  return enriched;
}

module.exports = {
  findGrantmakers,
  searchFoundations,
  getOrganization,
  summarizeFilings,
  normalizeFoundation,
  fieldMatches,
  NTEE_FIELDS
};
