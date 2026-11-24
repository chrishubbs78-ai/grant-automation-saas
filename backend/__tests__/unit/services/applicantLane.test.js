const { eligibleApplicantCodes, applicantLaneFor, prefilter } = require('../../../src/services/matchingEngine');

const store = { entityType: 'for_profit_small_business', fiscalSponsor: {} };
const hybrid = { entityType: 'hybrid', fiscalSponsor: { name: 'Utah Youth Fund' } };
const nonprofit = { taxExemptStatus: '501c3' };

describe('applicant lanes for a store with a sponsored youth program', () => {
  test('a for-profit store claims small-business codes only', () => {
    expect(eligibleApplicantCodes(store)).toEqual(expect.arrayContaining(['22', '23']));
    expect(eligibleApplicantCodes(store)).not.toContain('12');
  });

  test('a hybrid org claims both business and charity codes', () => {
    expect(eligibleApplicantCodes(hybrid)).toEqual(expect.arrayContaining(['12', '23']));
  });

  test('charity-only opportunities route to the sponsored program', () => {
    expect(applicantLaneFor({ eligibility_codes: ['12'] }, hybrid)).toBe('sponsored_program');
    expect(applicantLaneFor({ eligibility_codes: ['23'] }, hybrid)).toBe('business');
    expect(applicantLaneFor({ source: 'propublica_990', eligibility_codes: [] }, hybrid)).toBe('sponsored_program');
  });

  test('nonprofits always apply as themselves', () => {
    expect(applicantLaneFor({ eligibility_codes: ['12'] }, nonprofit)).toBe('organization');
  });

  test('prefilter rejects a charity-only grant for a store with no sponsor, and records the lane otherwise', () => {
    const opp = { eligibility_codes: ['12'], close_date: null };
    expect(prefilter(opp, store).checks.eligibility.passed).toBe(false);
    const ok = prefilter(opp, hybrid);
    expect(ok.checks.eligibility.passed).toBe(true);
    expect(ok.checks.eligibility.apply_as).toBe('sponsored_program');
  });
});
