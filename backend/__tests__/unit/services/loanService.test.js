const { assessReadiness, rankPrograms, LOAN_PROGRAMS, generateLoanPackage } = require('../../../src/services/loanService');

const baseOrg = (loanProfile = {}, businessPlan = {}) => ({ name: 'Dice & Dragons', loanProfile, businessPlan });

describe('loanService.assessReadiness', () => {
  test('empty profile scores zero and lists a fix for every item', () => {
    const r = assessReadiness(baseOrg());
    expect(r.score).toBe(0);
    expect(r.items.every(i => !i.done && i.fix)).toBe(true);
  });

  test('a prepared owner scores high and computes equity share of the project', () => {
    const long = 'x'.repeat(150);
    const plan = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(k => [k, long]));
    const r = assessReadiness(baseOrg({
      amount_needed: 90000, owner_equity: 10000, owner_credit_score: 700,
      use_of_funds: [{ item: 'Inventory', amount: 30000 }], has_projections: true,
      has_tax_returns: true, has_personal_financial_statement: true, industry_experience_years: 5
    }, plan));
    expect(r.score).toBe(100);
    expect(r.equity_pct_of_project).toBe(10);
  });
});

describe('loanService.rankPrograms', () => {
  test('a $40k startup ranks startup-friendly microloans above SBA 504', () => {
    const ranked = rankPrograms(baseOrg({ amount_needed: 40000, owner_credit_score: 660, months_in_business: 0 }));
    const keys = ranked.map(p => p.key);
    expect(keys.indexOf('sba_microloan')).toBeLessThan(keys.indexOf('sba_504'));
    const micro = ranked.find(p => p.key === 'sba_microloan');
    expect(micro.reasons).toContain('Covers the amount you need');
    expect(ranked.find(p => p.key === 'sba_504').cautions.join(' ')).toMatch(/building/);
  });

  test('low credit adds a caution on bank programs', () => {
    const ranked = rankPrograms(baseOrg({ amount_needed: 100000, owner_credit_score: 580 }));
    expect(ranked.find(p => p.key === 'sba_7a_small').cautions.join(' ')).toMatch(/credit/);
  });

  test('every program links to an official page', () => {
    for (const p of LOAN_PROGRAMS) expect(p.official_url).toMatch(/^https:\/\//);
  });
});

describe('loanService.generateLoanPackage (mock mode)', () => {
  test('returns every packet section and lists missing items', async () => {
    const pkg = await generateLoanPackage(baseOrg({ amount_needed: 50000, use_of_funds: ['Inventory'] }), { programKey: 'sba_microloan', lenderName: 'Utah Microlender' });
    expect(pkg.cover_letter).toMatch(/Utah Microlender/);
    expect(pkg.use_of_funds[0].item).toBe('Inventory');
    expect(pkg.still_needed.length).toBeGreaterThan(0);
  });
});
