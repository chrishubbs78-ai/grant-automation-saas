/**
 * Utah funder directory.
 *
 * Federal listings (Grants.gov) are national and heavily contested. For a
 * Utah-based nonprofit the better odds are usually in-state: state agencies,
 * county programs, and Utah family foundations all draw from a far smaller
 * applicant pool.
 *
 * These entries are DIRECTORY records, not live opportunities. Utah has no
 * public grants API, so there is no honest way to publish real deadlines and
 * award amounts here — inventing them would be worse than useless, because you
 * might act on them. Each entry says who the funder is, what they fund, and
 * where to check their current openings. Deadlines stay null on purpose.
 *
 * Award figures appear ONLY where a published program states them (marked
 * verified: true). Everything else is a lead to research, not a fact to trust.
 */

const UTAH_FUNDERS = [
  // ─── State agencies ───────────────────────────────────────────────────────
  {
    source_id: 'ut-arts-museums-gos',
    title: 'General Operating Support — Utah Division of Arts & Museums',
    agency: 'Utah Division of Arts & Museums',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'General Operating Support for Utah-based arts organizations, museums, and '
      + 'designated Local Arts Agencies. Applicants must be Utah 501(c)(3) nonprofits or government '
      + 'agencies whose primary mission is arts or museum services. Applications are submitted '
      + 'through the uamgrants.utah.gov portal.',
    eligibility_text: 'Utah-based 501(c)(3) nonprofits or government agencies with an arts or museum mission.',
    eligibility_codes: ['12', '25'],
    source_url: 'https://artsandmuseums.utah.gov/grants/',
    verified: true
  },
  {
    source_id: 'ut-goeo-eag',
    title: 'Economic Assistance Grant (EAG) — Governor\'s Office of Economic Opportunity',
    agency: 'Utah Governor\'s Office of Economic Opportunity',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'One-time, project-based awards administered by GOEO from a legislative '
      + 'appropriation. Supports economic development projects across Utah communities.',
    eligibility_text: 'See program guidelines; typically Utah entities including nonprofits and local governments.',
    eligibility_codes: ['12', '00', '01', '02', '25'],
    award_ceiling: 200000,
    source_url: 'https://business.utah.gov/grants/',
    verified: true
  },
  {
    source_id: 'ut-workforce-services',
    title: 'Community Services and Workforce Development Grants',
    agency: 'Utah Department of Workforce Services',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'State-administered funding streams covering homelessness services, community '
      + 'development, refugee services, intergenerational poverty initiatives, and workforce programs.',
    eligibility_text: 'Utah nonprofits, local governments, and community-based organizations.',
    eligibility_codes: ['12', '13', '00', '01', '02', '25'],
    source_url: 'https://jobs.utah.gov/',
    verified: false
  },
  {
    source_id: 'ut-board-education',
    title: 'Education Grant Programs — Utah State Board of Education',
    agency: 'Utah State Board of Education',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'Administers state and federal pass-through education funding, including '
      + 'after-school and out-of-school-time programs, literacy initiatives, and student support services.',
    eligibility_text: 'Utah LEAs, schools, and partnering nonprofit organizations.',
    eligibility_codes: ['12', '05', '25'],
    source_url: 'https://www.schools.utah.gov/',
    verified: false
  },
  {
    source_id: 'ut-cultural-community-engagement',
    title: 'Utah Department of Cultural & Community Engagement',
    agency: 'Utah Department of Cultural & Community Engagement',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'Parent department for Arts & Museums, State Library, Historical Society, '
      + 'Indian Affairs, and Multicultural Affairs — each administering its own grant lines.',
    eligibility_text: 'Varies by division; generally Utah nonprofits and public entities.',
    eligibility_codes: ['12', '25'],
    source_url: 'https://heritage.utah.gov/',
    verified: false
  },

  // ─── County / local ───────────────────────────────────────────────────────
  {
    source_id: 'slco-zap',
    title: 'Zoo, Arts & Parks (ZAP) Program — Salt Lake County',
    agency: 'Salt Lake County',
    geographic_scope: 'county',
    service_area: 'Salt Lake County',
    description: 'Sales-tax-funded support for cultural, zoological, botanical, and recreational '
      + 'organizations operating in Salt Lake County. Tier I and Tier II tracks by organization size.',
    eligibility_text: 'Nonprofit cultural and recreational organizations based in Salt Lake County.',
    eligibility_codes: ['12', '25'],
    source_url: 'https://slco.org/zap/',
    verified: false
  },

  // ─── Utah foundations ─────────────────────────────────────────────────────
  {
    source_id: 'eccles-gs-dd-foundation',
    title: 'George S. and Dolores Doré Eccles Foundation',
    agency: 'George S. and Dolores Doré Eccles Foundation',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'One of Utah\'s largest private funders. Grants for projects and programs '
      + 'throughout Utah in arts and culture, community, education, health care, and preservation '
      + 'and conservation. Founded 1960 in Salt Lake City.',
    eligibility_text: 'Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    verified: true
  },
  {
    source_id: 'community-foundation-utah',
    title: 'Community Foundation of Utah',
    agency: 'Community Foundation of Utah',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'Statewide community foundation making grants across Utah and connecting donors '
      + 'to local nonprofits. Runs several themed funds and periodic open grant rounds.',
    eligibility_text: 'Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    source_url: 'https://utahcf.org/',
    verified: true
  },
  {
    source_id: 'sorenson-legacy-foundation',
    title: 'Sorenson Legacy Foundation',
    agency: 'Sorenson Legacy Foundation',
    geographic_scope: 'state',
    service_area: 'Primarily Utah',
    description: 'Major Utah family foundation supporting education, the arts, health and human '
      + 'services, and programs for people with disabilities.',
    eligibility_text: 'Primarily Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    verified: false
  },
  {
    source_id: 'dumke-foundation',
    title: 'Katherine W. and Ezekiel R. Dumke Jr. Foundation',
    agency: 'Dumke Foundation',
    geographic_scope: 'state',
    service_area: 'Primarily Utah',
    description: 'Utah family foundation with a long record of grants in health, education, '
      + 'human services, and the arts along the Wasatch Front.',
    eligibility_text: 'Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    verified: false
  },
  {
    source_id: 'noorda-foundation',
    title: 'Ray and Tye Noorda Foundation',
    agency: 'Ray and Tye Noorda Foundation',
    geographic_scope: 'state',
    service_area: 'Primarily Utah',
    description: 'Utah-based foundation funding education, youth programs, and health initiatives.',
    eligibility_text: 'Primarily Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    verified: false
  },
  {
    source_id: 'semnani-family-foundation',
    title: 'Semnani Family Foundation',
    agency: 'Semnani Family Foundation',
    geographic_scope: 'state',
    service_area: 'Utah and international',
    description: 'Salt Lake City foundation supporting humanitarian, health, and education work '
      + 'in Utah and abroad.',
    eligibility_text: 'Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    verified: false
  },
  {
    source_id: 'huntsman-foundation',
    title: 'Huntsman Foundation',
    agency: 'Huntsman Foundation',
    geographic_scope: 'state',
    service_area: 'Primarily Utah',
    description: 'Utah family foundation with major giving in cancer research, education, and '
      + 'human services.',
    eligibility_text: 'Primarily Utah 501(c)(3) organizations.',
    eligibility_codes: ['12'],
    verified: false
  },
  {
    source_id: 'united-way-salt-lake',
    title: 'United Way of Salt Lake',
    agency: 'United Way of Salt Lake',
    geographic_scope: 'county',
    service_area: 'Salt Lake, Davis, Summit, Tooele counties',
    description: 'Collective-impact funder and partner for education, health, and financial '
      + 'stability work along the Wasatch Front. Partnership-based rather than open application.',
    eligibility_text: 'Nonprofits serving the Wasatch Front; typically via partnership agreements.',
    eligibility_codes: ['12'],
    source_url: 'https://uw.org/',
    verified: false
  },
  {
    source_id: 'intermountain-community-health',
    title: 'Intermountain Health Community Health Investment',
    agency: 'Intermountain Health',
    geographic_scope: 'regional',
    service_area: 'Utah and Intermountain West',
    description: 'Health system community benefit funding addressing needs identified in local '
      + 'community health assessments — behavioral health, food security, housing stability.',
    eligibility_text: 'Nonprofits serving Intermountain Health communities.',
    eligibility_codes: ['12'],
    verified: false
  },

  // ─── Capacity / research resources ────────────────────────────────────────
  {
    source_id: 'utah-nonprofits-association',
    title: 'Utah Nonprofits Association — funder resources and member directory',
    agency: 'Utah Nonprofits Association',
    geographic_scope: 'state',
    service_area: 'Statewide Utah',
    description: 'Not a funder itself. Statewide membership association offering a funder '
      + 'directory, capacity-building programs, and grant-seeking resources for Utah nonprofits.',
    eligibility_text: 'Utah nonprofit organizations.',
    eligibility_codes: ['12', '13'],
    source_url: 'https://utahnonprofits.org/',
    verified: true
  }
];

/**
 * Return directory entries normalized to the GrantOpportunity shape.
 * Deadlines are deliberately null: these are standing funders, not dated calls.
 */
function getUtahFunders() {
  return UTAH_FUNDERS.map(f => ({
    source: 'utah_directory',
    source_id: f.source_id,
    opportunity_number: null,
    title: f.title,
    agency: f.agency,
    agency_code: null,
    description: f.description
      + (f.verified
        ? ''
        : '\n\nDirectory entry — confirm current guidelines and deadlines with the funder before applying.'),
    open_date: null,
    close_date: null, // standing funder, not a dated call
    award_floor: f.award_floor || null,
    award_ceiling: f.award_ceiling || null,
    total_funding: null,
    expected_awards: null,
    cost_sharing_required: false,
    eligibility_codes: f.eligibility_codes || [],
    eligibility_text: f.eligibility_text || null,
    category: null,
    geographic_scope: f.geographic_scope,
    eligible_states: ['UT'],
    service_area: f.service_area,
    opportunity_status: 'directory',
    source_url: f.source_url || null,
    raw: { verified: f.verified }
  }));
}

module.exports = { getUtahFunders, UTAH_FUNDERS };
