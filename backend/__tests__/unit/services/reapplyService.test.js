const {
  estimateNextCycleDate,
  isWithinLeadWindow,
  REAPPLY_LEAD_DAYS
} = require('../../../src/services/reapplyService');

describe('reapplyService', () => {
  describe('estimateNextCycleDate', () => {
    test('adds one year to the original deadline', () => {
      const next = estimateNextCycleDate(new Date('2026-03-15'));
      expect(next.getFullYear()).toBe(2027);
      expect(next.getMonth()).toBe(2); // March
      expect(next.getDate()).toBe(15);
    });

    test('returns null when no deadline given', () => {
      expect(estimateNextCycleDate(null)).toBeNull();
      expect(estimateNextCycleDate(undefined)).toBeNull();
    });

    test('accepts date strings', () => {
      const next = estimateNextCycleDate('2026-06-30');
      expect(next.getFullYear()).toBe(2027);
    });
  });

  describe('isWithinLeadWindow', () => {
    const now = new Date('2026-06-11T00:00:00Z');

    test('returns true when next cycle is inside the lead window', () => {
      const soon = new Date(now.getTime() + (REAPPLY_LEAD_DAYS - 1) * 24 * 60 * 60 * 1000);
      expect(isWithinLeadWindow(soon, now)).toBe(true);
    });

    test('returns false when next cycle is beyond the lead window', () => {
      const far = new Date(now.getTime() + (REAPPLY_LEAD_DAYS + 30) * 24 * 60 * 60 * 1000);
      expect(isWithinLeadWindow(far, now)).toBe(false);
    });

    test('returns true when next cycle date is already past', () => {
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(isWithinLeadWindow(past, now)).toBe(true);
    });

    test('returns false when no next cycle date', () => {
      expect(isWithinLeadWindow(null, now)).toBe(false);
    });
  });
});
