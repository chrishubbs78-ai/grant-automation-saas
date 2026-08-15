const {
  summarizeFilings,
  fieldMatches,
  normalizeFoundation,
  NTEE_FIELDS
} = require('../../../src/services/propublicaService');
const {
  nteeFieldsFor,
  normalizeFunderName
} = require('../../../src/services/matchingEngine');

describe('ProPublica — filing summary', () => {
  test('Takes the most recent filing, not the first in the array', () => {
    const summary = summarizeFilings({
      filings_with_data: [
        { tax_prd_yr: 2021, grntspaid: 100000, totassetsend: 5000000 },
        { tax_prd_yr: 2024, grntspaid: 900000, totassetsend: 9000000 },
        { tax_prd_yr: 2022, grntspaid: 300000, totassetsend: 6000000 }
      ]
    });
    expect(summary.tax_year).toBe(2024);
    expect(summary.grants_paid).toBe(900000);
  });

  test('Returns nulls rather than throwing when a foundation has no filing data', () => {
    expect(summarizeFilings({}).grants_paid).toBeNull();
    expect(summarizeFilings({ filings_with_data: [] }).assets).toBeNull();
  });

  test('Parses figures that arrive as formatted strings', () => {
    const summary = summarizeFilings({
      filings_with_data: [{ tax_prd_yr: 2024, grntspaid: '$1,250,000', totassetsend: '20,000,000' }]
    });
    expect(summary.grants_paid).toBe(1250000);
    expect(summary.assets).toBe(20000000);
  });

  test('Missing individual fields do not poison the rest of the summary', () => {
    const summary = summarizeFilings({
      filings_with_data: [{ tax_prd_yr: 2024, grntspaid: 500000 }]
    });
    expect(summary.grants_paid).toBe(500000);
    expect(summary.assets).toBeNull();
  });
});

describe('ProPublica — NTEE field filtering', () => {
  test('Matches on the first letter of the code', () => {
    expect(fieldMatches('B11', ['B', 'O'])).toBe(true);
    expect(fieldMatches('O50', ['B', 'O'])).toBe(true);
    expect(fieldMatches('C30', ['B', 'O'])).toBe(false);
  });

  test('An empty wanted-list means do not filter, not match nothing', () => {
    expect(fieldMatches('C30', [])).toBe(true);
  });

  test('A foundation with no NTEE code is kept rather than dropped', () => {
    expect(fieldMatches(null, ['B'])).toBe(true);
  });
});

describe('ProPublica — normalization to an opportunity', () => {
  const org = {
    ein: '876102547', name: 'Wasatch Education Trust', city: 'Salt Lake City',
    state: 'UT', ntee_code: 'B11'
  };
  const summary = { grants_paid: 2400000, assets: 48000000, revenue: 3100000, tax_year: 2024 };

  test('Never invents a deadline for a rolling foundation', () => {
    const opp = normalizeFoundation(org, summary);
    expect(opp.close_date).toBeNull();
    expect(opp.open_date).toBeNull();
  });

  test('Never invents an award range', () => {
    const opp = normalizeFoundation(org, summary);
    expect(opp.award_floor).toBeNull();
    expect(opp.award_ceiling).toBeNull();
  });

  test('Carries real grant totals and links to the filing', () => {
    const opp = normalizeFoundation(org, summary);
    expect(opp.total_funding).toBe(2400000);
    expect(opp.description).toContain('$2,400,000');
    expect(opp.source_url).toContain('876102547');
    expect(opp.raw.ein).toBe('876102547');
  });

  test('Says plainly that the figures lag and must be confirmed', () => {
    const opp = normalizeFoundation(org, summary);
    expect(opp.description).toMatch(/lag 1–2 years/);
    expect(opp.description).toMatch(/current guidelines/);
  });

  test('Scoped to the foundation home state so geographic filtering applies', () => {
    const opp = normalizeFoundation(org, summary);
    expect(opp.eligible_states).toEqual(['UT']);
    expect(opp.geographic_scope).toBe('state');
  });

  test('Translates the NTEE code into a readable field', () => {
    const opp = normalizeFoundation(org, summary);
    expect(opp.category).toBe(NTEE_FIELDS.B);
    expect(opp.description).toContain('Education');
  });

  test('Handles a foundation with no filing figures at all', () => {
    const opp = normalizeFoundation(org, {});
    expect(opp.total_funding).toBeNull();
    expect(opp.title).toBe('Wasatch Education Trust');
  });
});

describe('Matching engine — inferring which fields to search', () => {
  test('Reads education and youth from a youth-education mission', () => {
    const fields = nteeFieldsFor({
      mission: 'We help low-income youth succeed in school through STEM mentoring and after-school programs.'
    });
    expect(fields).toContain('B');
    expect(fields).toContain('O');
    expect(fields).not.toContain('C');
  });

  test('Always keeps grantmaking foundations in scope', () => {
    // Family foundations often classify themselves as T regardless of what
    // they actually fund, so excluding T would hide the best local prospects.
    const fields = nteeFieldsFor({ mission: 'Literacy tutoring for students.' });
    expect(fields).toContain('T');
  });

  test('An empty profile means search every field, not none', () => {
    expect(nteeFieldsFor({})).toEqual([]);
    expect(nteeFieldsFor({ mission: '   ' })).toEqual([]);
  });

  test('Reads programs as well as the mission statement', () => {
    const fields = nteeFieldsFor({
      mission: 'Serving our community.',
      programsAndServices: [{ name: 'Food Pantry', description: 'Weekly nutrition support' }]
    });
    expect(fields).toContain('K');
  });
});

describe('Matching engine — cross-source funder dedupe', () => {
  test('Matches the same funder across naming conventions', () => {
    expect(normalizeFunderName('The Eccles Foundation'))
      .toBe(normalizeFunderName('Eccles Foundation, Inc.'));
    expect(normalizeFunderName('Sorenson Legacy Foundation'))
      .toBe(normalizeFunderName('Sorenson Legacy'));
  });

  test('Keeps genuinely different funders distinct', () => {
    expect(normalizeFunderName('Huntsman Foundation'))
      .not.toBe(normalizeFunderName('Eccles Foundation'));
  });

  test('Survives empty and missing names', () => {
    expect(normalizeFunderName(null)).toBe('');
    expect(normalizeFunderName('')).toBe('');
  });
});
