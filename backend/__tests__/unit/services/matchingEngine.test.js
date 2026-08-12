const {
  prefilter,
  buildSearchTerms,
  eligibleApplicantCodes,
  MIN_LEAD_DAYS
} = require('../../../src/services/matchingEngine');

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
    expect(Object.keys(checks).sort()).toEqual(['award_size', 'deadline', 'eligibility']);
    expect(checks.deadline.passed).toBe(false);
    expect(checks.eligibility.passed).toBe(false);
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
