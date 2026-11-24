const builder = require('../../../src/services/businessPlanBuilder');

describe('businessPlanBuilder', () => {
  test('sections include the youth program and every question id is unique', () => {
    expect(builder.SECTION_KEYS).toContain('youth_program');
    const ids = builder.SECTIONS.flatMap(s => s.questions.map(q => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('completeness counts only required questions toward percent', () => {
    expect(builder.completeness({}).percent).toBe(0);
    const yp = builder.SECTIONS.find(s => s.key === 'youth_program');
    const answers = Object.fromEntries(yp.questions.filter(q => q.required).map(q => [q.id, 'yes']));
    const result = builder.completeness(answers);
    expect(result.sections.find(s => s.key === 'youth_program').ready_to_write).toBe(true);
    expect(result.percent).toBeGreaterThan(0);
    expect(result.percent).toBeLessThan(100);
  });

  test('sanitizeAnswers drops unknown ids and caps length', () => {
    const out = builder.sanitizeAnswers({ yp_who: 'a'.repeat(5000), evil: 'x', es_ask: 50000 });
    expect(out.evil).toBeUndefined();
    expect(out.yp_who.length).toBe(4000);
    expect(out.es_ask).toBe('50000');
  });

  test('quick recommendations push a fiscal sponsor for a for-profit without one', () => {
    const recs = builder.quickRecommendations({ entityType: 'for_profit_small_business', fiscalSponsor: {} }, {});
    expect(recs[0].area).toBe('Grant eligibility');
    const withSponsor = builder.quickRecommendations({ entityType: 'hybrid', fiscalSponsor: { name: 'Utah Youth Fund' } }, {});
    expect(withSponsor.some(r => r.area === 'Grant eligibility')).toBe(false);
  });

  test('writeSection in mock mode uses the owner answers and lists what is missing', async () => {
    const org = { name: 'Dice & Dragons', businessPlanBuilder: { answers: { yp_who: 'Kids 10-15 at Lincoln Middle' } } };
    const result = await builder.writeSection(org, 'youth_program');
    expect(result.text).toMatch(/Lincoln Middle/);
    expect(result.still_needed.length).toBeGreaterThan(0);
  });

  test('writeSection rejects an unknown section', async () => {
    await expect(builder.writeSection({}, 'nope')).rejects.toThrow(/Unknown section/);
  });
});
