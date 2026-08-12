const {
  prefilter,
  buildSearchTerms,
  eligibleApplicantCodes,
  localityBoost,
  orgHomeState,
  MIN_LEAD_DAYS
} = require('../../../src/services/matchingEngine');
const { getUtahFunders } = require('../../../src/services/utahFunderDirectory');

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const org = (overrides = {}) => ({
  name: 'Test Org',
  taxExemptStatus: '501c3',
  annualBudget: 1000000,
  mission: 'We support underserved youth through mentoring and education.',
  programsAndServices: [],
  constraints: {},
  ...overrides
});

const opportunity = (overrides = {}) => ({
  title: 'Youth Education Grant',
  close_date: daysFromNow(60),
  eligibility_codes: [],
  award_ceiling: null,
  eligible_states: [],
  geographic_scope: 'national',
  ...overrides
});

describe('Matching Engine — Stage 1 prefilter', () => {
  describe('deadline lead time', () => {
    test('Passes an opportunity with ample runway', () => {
      const { passed, checks } = prefilter(opportunity(), org());
      expect(passed).toBe(true);
      expect(checks.deadline.passed).toBe(true);
      expect(checks.deadline.days_until_close).toBeGreaterThan(MIN_LEAD_DAYS);
    });

    test('Rejects an opportunity closing sooner than the minimum lead time', () => {
      const { passed, checks } = prefilter(
        opportunity({ close_date: daysFromNow(2) }),
        org()
      );
      expect(passed).toBe(false);
      expect(checks.deadline.passed).toBe(false);
      expect(checks.deadline.reason).toMatch(/2 days until close/);
    });

    test('Rejects an opportunity whose deadline has passed', () => {
      const { passed, checks } = prefilter(
        opportunity({ close_date: daysFromNow(-5) }),
        org()
      );
      expect(passed).toBe(false);
      expect(checks.deadline.reason).toBe('Deadline has passed');
    });

    test('Treats a missing deadline as rolling, not disqualifying', () => {
      const { passed, checks } = prefilter(opportunity({ close_date: null }), org());
      expect(passed).toBe(true);
      expect(checks.deadline.days_until_close).toBeNull();
    });
  });

  describe('eligibility codes', () => {
    test('Passes when the org applicant type is listed', () => {
      // 12 = nonprofits with 501(c)(3) status
      const { passed, checks } = prefilter(
        opportunity({ eligibility_codes: ['12', '06'] }),
        org({ taxExemptStatus: '501c3' })
      );
      expect(passed).toBe(true);
      expect(checks.eligibility.matched_codes).toContain('12');
    });

    test('Rejects when the opportunity excludes the org applicant type', () => {
      // 21 = individuals, 23 = small businesses — neither fits a 501(c)(3)
      const { passed, checks } = prefilter(
        opportunity({ eligibility_codes: ['21', '23'] }),
        org({ taxExemptStatus: '501c3' })
      );
      expect(passed).toBe(false);
      expect(checks.eligibility.passed).toBe(false);
      expect(checks.eligibility.reason).toMatch(/excludes/);
    });

    test('Treats an unspecified eligibility list as unknown, not ineligible', () => {
      const { passed, checks } = prefilter(
        opportunity({ eligibility_codes: [] }),
        org()
      );
      expect(passed).toBe(true);
      expect(checks.eligibility.passed).toBe(true);
    });

    test('Government orgs map to government applicant codes', () => {
      const codes = eligibleApplicantCodes({ taxExemptStatus: 'government' });
      expect(codes).toContain('00');
      expect(codes).not.toContain('12');
    });
  });

  describe('award size vs organizational capacity', () => {
    test('Rejects an award far beyond the org budget', () => {
      const { passed, checks } = prefilter(
        opportunity({ award_ceiling: 40000000 }),
        org({ annualBudget: 1000000 })
      );
      expect(passed).toBe(false);
      expect(checks.award_size.award_to_budget_multiple).toBe(40);
      expect(checks.award_size.reason).toMatch(/40.0x your annual budget/);
    });

    test('Passes an award proportionate to the org budget', () => {
      const { passed } = prefilter(
        opportunity({ award_ceiling: 250000 }),
        org({ annualBudget: 1000000 })
      );
      expect(passed).toBe(true);
    });

    test('Skips the check when budget or ceiling is unknown', () => {
      const { passed, checks } = prefilter(
        opportunity({ award_ceiling: 40000000 }),
        org({ annualBudget: null })
      );
      expect(passed).toBe(true);
      expect(checks.award_size.award_to_budget_multiple).toBeNull();
    });
  });

  test('Records every check even when one fails, so rejections are explainable', () => {
    const { checks } = prefilter(
      opportunity({ close_date: daysFromNow(1), eligibility_codes: ['21'] }),
      org()
    );
    expect(Object.keys(checks).sort()).toEqual(['award_size', 'deadline', 'eligibility', 'geography']);
    expect(checks.deadline.passed).toBe(false);
    expect(checks.eligibility.passed).toBe(false);
  });
});

describe('Matching Engine — geographic eligibility', () => {
  const utahOrg = () => org({ address: { city: 'Salt Lake City', state: 'UT', zip: '84101' } });

  test('Reads the org home state from its address', () => {
    expect(orgHomeState(utahOrg())).toBe('UT');
    expect(orgHomeState(org({ address: { state: 'ut' } }))).toBe('UT');
    expect(orgHomeState(org({ address: {} }))).toBeNull();
  });

  test('Passes a Utah funder for a Utah organization', () => {
    const { passed, checks } = prefilter(
      opportunity({ eligible_states: ['UT'], geographic_scope: 'state' }),
      utahOrg()
    );
    expect(passed).toBe(true);
    expect(checks.geography.passed).toBe(true);
  });

  test('Rejects an out-of-state-only funder however well the mission fits', () => {
    const { passed, checks } = prefilter(
      opportunity({ eligible_states: ['CA', 'OR'], geographic_scope: 'state' }),
      utahOrg()
    );
    expect(passed).toBe(false);
    expect(checks.geography.passed).toBe(false);
    expect(checks.geography.reason).toMatch(/Funds only CA, OR/);
  });

  test('Treats an unrestricted funder as open to everyone', () => {
    const { checks } = prefilter(opportunity({ eligible_states: [] }), utahOrg());
    expect(checks.geography.passed).toBe(true);
  });

  test('Does not filter geographically when the org has no address yet', () => {
    const { checks } = prefilter(
      opportunity({ eligible_states: ['CA'] }),
      org({ address: {} })
    );
    expect(checks.geography.passed).toBe(true);
    expect(checks.geography.org_state).toBeNull();
  });
});

describe('Matching Engine — local preference', () => {
  const utahOrg = () => org({ address: { state: 'UT' } });

  test('County and city funders earn the largest boost', () => {
    const b = localityBoost(
      opportunity({ eligible_states: ['UT'], geographic_scope: 'county', service_area: 'Salt Lake County' }),
      utahOrg()
    );
    expect(b.points).toBe(20);
    expect(b.reason).toMatch(/Salt Lake County/);
  });

  test('Statewide funders earn a smaller boost than county ones', () => {
    const state = localityBoost(opportunity({ eligible_states: ['UT'], geographic_scope: 'state' }), utahOrg());
    const county = localityBoost(opportunity({ eligible_states: ['UT'], geographic_scope: 'county' }), utahOrg());
    expect(state.points).toBe(15);
    expect(state.points).toBeLessThan(county.points);
  });

  test('National programs earn no boost', () => {
    const b = localityBoost(opportunity({ eligible_states: [], geographic_scope: 'national' }), utahOrg());
    expect(b.points).toBe(0);
    expect(b.reason).toBeNull();
  });

  test('An out-of-state funder earns no boost even if locally scoped', () => {
    const b = localityBoost(
      opportunity({ eligible_states: ['CA'], geographic_scope: 'county' }),
      utahOrg()
    );
    expect(b.points).toBe(0);
  });

  test('No boost when the org has not set an address', () => {
    const b = localityBoost(
      opportunity({ eligible_states: ['UT'], geographic_scope: 'state' }),
      org({ address: {} })
    );
    expect(b.points).toBe(0);
  });
});

describe('Utah funder directory', () => {
  const funders = getUtahFunders();

  test('Every entry is scoped to Utah', () => {
    expect(funders.length).toBeGreaterThan(10);
    funders.forEach(f => {
      expect(f.eligible_states).toEqual(['UT']);
      expect(f.source).toBe('utah_directory');
    });
  });

  test('No entry invents a deadline', () => {
    // These are standing funders, not dated calls. A fabricated deadline is the
    // one error here that could actually cost someone a submission.
    funders.forEach(f => expect(f.close_date).toBeNull());
  });

  test('Unverified entries tell the reader to confirm before applying', () => {
    const unverified = funders.filter(f => f.raw.verified === false);
    expect(unverified.length).toBeGreaterThan(0);
    unverified.forEach(f => expect(f.description).toMatch(/confirm current guidelines/i));
  });

  test('Award figures appear only on verified entries', () => {
    funders.filter(f => f.award_ceiling !== null)
      .forEach(f => expect(f.raw.verified).toBe(true));
  });

  test('Every entry links somewhere — no dead ends', () => {
    funders.forEach(f => {
      expect(f.source_url).toBeTruthy();
      expect(f.source_url).toMatch(/^https:\/\//);
      expect(['official', 'search']).toContain(f.raw.url_kind);
    });
  });

  test('Funders without a confirmed page get a search link, not a guessed URL', () => {
    const searchLinked = funders.filter(f => f.raw.url_kind === 'search');
    expect(searchLinked.length).toBeGreaterThan(0);
    searchLinked.forEach(f => {
      expect(f.source_url).toContain('google.com/search');
      // The search must actually name the funder, or it sends you nowhere useful
      expect(decodeURIComponent(f.source_url)).toContain(f.agency);
    });
  });

  test('Verified state programs link to their own grants page', () => {
    const arts = funders.find(f => f.source_id === 'ut-arts-museums-gos');
    expect(arts.raw.url_kind).toBe('official');
    expect(arts.source_url).toContain('artsandmuseums.utah.gov');
  });

  test('Includes state agencies, county programs, and private foundations', () => {
    const scopes = new Set(funders.map(f => f.geographic_scope));
    expect(scopes.has('state')).toBe(true);
    expect(scopes.has('county')).toBe(true);
  });

  test('Directory entries clear the prefilter for a Utah nonprofit', () => {
    const utahOrg = org({ address: { state: 'UT' }, taxExemptStatus: '501c3' });
    const passing = funders.filter(f => prefilter({
      close_date: f.close_date,
      eligibility_codes: f.eligibility_codes,
      award_ceiling: f.award_ceiling,
      eligible_states: f.eligible_states,
      geographic_scope: f.geographic_scope
    }, utahOrg).passed);
    expect(passing.length).toBeGreaterThan(10);
  });
});

describe('Matching Engine — search term derivation', () => {
  test('Prefers explicitly configured keywords', () => {
    const terms = buildSearchTerms(org({
      constraints: { search_keywords: ['literacy', 'after-school'] }
    }));
    expect(terms).toEqual(['literacy', 'after-school']);
  });

  test('Falls back to program names', () => {
    const terms = buildSearchTerms(org({
      programsAndServices: [{ name: 'STEM Academy' }, { name: 'Reading Corps' }]
    }));
    expect(terms).toContain('STEM Academy');
  });

  test('Falls back to distinctive mission words when nothing else is set', () => {
    const terms = buildSearchTerms(org({
      mission: 'We support underserved youth through mentoring and education.'
    }));
    expect(terms.length).toBeGreaterThan(0);
    // Stopwords must not become search terms
    expect(terms).not.toContain('through');
    expect(terms).not.toContain('and');
  });

  test('Returns a usable term even for an empty profile', () => {
    const terms = buildSearchTerms({ constraints: {}, programsAndServices: [] });
    expect(terms.length).toBeGreaterThan(0);
  });
});
