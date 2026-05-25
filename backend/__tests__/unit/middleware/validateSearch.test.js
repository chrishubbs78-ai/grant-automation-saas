const Joi = require('joi');

// Define validation schemas
const searchQuerySchema = Joi.object({
  status: Joi.string().valid('draft', 'submitted', 'pending', 'funded', 'rejected').optional(),
  funder_name: Joi.string().max(255).optional(),
  deadline_before: Joi.date().iso().optional(),
  deadline_after: Joi.date().iso().optional(),
  amount_min: Joi.number().min(0).optional(),
  amount_max: Joi.number().min(0).optional(),
  search: Joi.string().max(255).optional(),
  sort: Joi.string().valid('deadline', 'amount', 'created_at', 'funder_name').optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional()
}).custom((value, helpers) => {
  // Custom validation: amount_min must be <= amount_max
  if (value.amount_min !== undefined && value.amount_max !== undefined) {
    if (value.amount_min > value.amount_max) {
      return helpers.error('any.custom', { message: 'amount_min must be <= amount_max' });
    }
  }

  // Custom validation: deadline_after must be before deadline_before
  if (value.deadline_after !== undefined && value.deadline_before !== undefined) {
    if (value.deadline_after > value.deadline_before) {
      return helpers.error('any.custom', { message: 'deadline_after must be before deadline_before' });
    }
  }

  return value;
});

const grantFieldSchema = Joi.object({
  funder_name: Joi.string().max(255).required(),
  deadline: Joi.date().iso().optional(),
  amount: Joi.number().min(0).optional(),
  status: Joi.string().valid('draft', 'submitted', 'pending', 'funded', 'rejected').optional(),
  notes: Joi.string().max(5000).optional()
});

const templateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  type: Joi.string().valid('grant_profile', 'budget_template', 'narrative_template').required(),
  description: Joi.string().max(1000).optional(),
  content: Joi.object().optional()
});

describe('Search & Filter Validation', () => {
  describe('Status Enum Validation', () => {
    test('Should accept valid status values', async () => {
      const validStatuses = ['draft', 'submitted', 'pending', 'funded', 'rejected'];

      for (const status of validStatuses) {
        const { error, value } = searchQuerySchema.validate({ status });
        expect(error).toBeUndefined();
        expect(value.status).toBe(status);
      }
    });

    test('Should reject invalid status values', async () => {
      const invalidStatuses = ['in_progress', 'approved', 'archived', 'invalid_status'];

      for (const status of invalidStatuses) {
        const { error } = searchQuerySchema.validate({ status });
        expect(error).toBeDefined();
      }
    });

    test('Should allow missing status (optional)', async () => {
      const { error, value } = searchQuerySchema.validate({});
      expect(error).toBeUndefined();
      expect(value.status).toBeUndefined();
    });
  });

  describe('Pagination Validation', () => {
    test('Should accept valid page numbers', async () => {
      const validPages = [1, 2, 10, 100];

      for (const page of validPages) {
        const { error, value } = searchQuerySchema.validate({ page });
        expect(error).toBeUndefined();
        expect(value.page).toBe(page);
      }
    });

    test('Should reject invalid page numbers', async () => {
      const invalidPages = [0, -1, -100, 'abc'];

      for (const page of invalidPages) {
        const { error } = searchQuerySchema.validate({ page });
        expect(error).toBeDefined();
      }
    });

    test('Should default page to 1', async () => {
      const { value } = searchQuerySchema.validate({});
      expect(value.page).toBe(1);
    });

    test('Should accept valid limit values', async () => {
      const validLimits = [1, 10, 20, 50, 100];

      for (const limit of validLimits) {
        const { error, value } = searchQuerySchema.validate({ limit });
        expect(error).toBeUndefined();
        expect(value.limit).toBe(limit);
      }
    });

    test('Should reject limit > 100', async () => {
      const { error } = searchQuerySchema.validate({ limit: 101 });
      expect(error).toBeDefined();
    });

    test('Should reject limit < 1', async () => {
      const { error } = searchQuerySchema.validate({ limit: 0 });
      expect(error).toBeDefined();
    });

    test('Should default limit to 20', async () => {
      const { value } = searchQuerySchema.validate({});
      expect(value.limit).toBe(20);
    });
  });

  describe('Date Validation', () => {
    test('Should accept valid ISO 8601 dates', async () => {
      const validDates = [
        '2026-12-31',
        '2026-12-31T23:59:59Z',
        '2026-01-01'
      ];

      for (const date of validDates) {
        const { error } = searchQuerySchema.validate({ deadline_before: date });
        expect(error).toBeUndefined();
      }
    });

    test('Should reject invalid date formats', async () => {
      const invalidDates = [
        '12/31/2026',
        '2026-13-01',
        '2026-12-32',
        'Dec 31, 2026',
        'not-a-date'
      ];

      for (const date of invalidDates) {
        const { error } = searchQuerySchema.validate({ deadline_before: date });
        expect(error).toBeDefined();
      }
    });

    test('Should validate deadline_after < deadline_before', async () => {
      const { error } = searchQuerySchema.validate({
        deadline_after: '2026-01-01',
        deadline_before: '2026-12-31'
      });

      expect(error).toBeUndefined();
    });

    test('Should reject deadline_after > deadline_before', async () => {
      const { error } = searchQuerySchema.validate({
        deadline_after: '2026-12-31',
        deadline_before: '2026-01-01'
      });

      expect(error).toBeDefined();
    });
  });

  describe('Amount Range Validation', () => {
    test('Should accept valid amount ranges', async () => {
      const { error, value } = searchQuerySchema.validate({
        amount_min: 50000,
        amount_max: 100000
      });

      expect(error).toBeUndefined();
      expect(value.amount_min).toBe(50000);
      expect(value.amount_max).toBe(100000);
    });

    test('Should accept zero amount', async () => {
      const { error, value } = searchQuerySchema.validate({
        amount_min: 0,
        amount_max: 100000
      });

      expect(error).toBeUndefined();
    });

    test('Should reject negative amounts', async () => {
      const { error } = searchQuerySchema.validate({
        amount_min: -50000
      });

      expect(error).toBeDefined();
    });

    test('Should validate amount_min <= amount_max', async () => {
      const { error } = searchQuerySchema.validate({
        amount_min: 100000,
        amount_max: 50000
      });

      expect(error).toBeDefined();
    });

    test('Should allow amount_min == amount_max', async () => {
      const { error, value } = searchQuerySchema.validate({
        amount_min: 100000,
        amount_max: 100000
      });

      expect(error).toBeUndefined();
      expect(value.amount_min).toBe(100000);
      expect(value.amount_max).toBe(100000);
    });
  });

  describe('Sort Field Validation', () => {
    test('Should accept valid sort fields', async () => {
      const validSorts = ['deadline', 'amount', 'created_at', 'funder_name'];

      for (const sort of validSorts) {
        const { error } = searchQuerySchema.validate({ sort });
        expect(error).toBeUndefined();
      }
    });

    test('Should reject invalid sort fields', async () => {
      const invalidSorts = ['status', 'org_id', 'random_field'];

      for (const sort of invalidSorts) {
        const { error } = searchQuerySchema.validate({ sort });
        expect(error).toBeDefined();
      }
    });
  });

  describe('String Field Validation', () => {
    test('Should accept valid funder_name', async () => {
      const { error } = searchQuerySchema.validate({
        funder_name: 'National Science Foundation'
      });

      expect(error).toBeUndefined();
    });

    test('Should reject funder_name > 255 chars', async () => {
      const longName = 'a'.repeat(256);
      const { error } = searchQuerySchema.validate({
        funder_name: longName
      });

      expect(error).toBeDefined();
    });

    test('Should accept valid search term', async () => {
      const { error } = searchQuerySchema.validate({
        search: 'climate research'
      });

      expect(error).toBeUndefined();
    });

    test('Should reject search > 255 chars', async () => {
      const longSearch = 'a'.repeat(256);
      const { error } = searchQuerySchema.validate({
        search: longSearch
      });

      expect(error).toBeDefined();
    });
  });
});

describe('Grant Field Validation', () => {
  describe('Required Fields', () => {
    test('Should require funder_name', async () => {
      const { error } = grantFieldSchema.validate({
        deadline: '2026-12-31'
      });

      expect(error).toBeDefined();
      expect(error.message).toContain('funder_name');
    });

    test('Should accept grant with required fields only', async () => {
      const { error, value } = grantFieldSchema.validate({
        funder_name: 'NSF'
      });

      expect(error).toBeUndefined();
      expect(value.funder_name).toBe('NSF');
    });
  });

  describe('Optional Fields', () => {
    test('Should accept optional deadline', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        deadline: '2026-12-31'
      });

      expect(error).toBeUndefined();
    });

    test('Should accept optional amount', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        amount: 250000
      });

      expect(error).toBeUndefined();
    });

    test('Should accept optional status', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        status: 'submitted'
      });

      expect(error).toBeUndefined();
    });

    test('Should accept optional notes', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        notes: 'Important grant opportunity'
      });

      expect(error).toBeUndefined();
    });
  });

  describe('Status Enum in Grant', () => {
    test('Should accept valid status in grant', async () => {
      const validStatuses = ['draft', 'submitted', 'pending', 'funded', 'rejected'];

      for (const status of validStatuses) {
        const { error } = grantFieldSchema.validate({
          funder_name: 'NSF',
          status
        });

        expect(error).toBeUndefined();
      }
    });

    test('Should reject invalid status in grant', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        status: 'invalid_status'
      });

      expect(error).toBeDefined();
    });
  });

  describe('Amount Validation in Grant', () => {
    test('Should accept zero amount', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        amount: 0
      });

      expect(error).toBeUndefined();
    });

    test('Should reject negative amount', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        amount: -50000
      });

      expect(error).toBeDefined();
    });

    test('Should accept large amounts', async () => {
      const { error } = grantFieldSchema.validate({
        funder_name: 'NSF',
        amount: 50000000
      });

      expect(error).toBeUndefined();
    });
  });
});

describe('Template Validation', () => {
  describe('Required Template Fields', () => {
    test('Should require name and type', async () => {
      const { error } = templateSchema.validate({});
      expect(error).toBeDefined();
    });

    test('Should require name', async () => {
      const { error } = templateSchema.validate({
        type: 'grant_profile'
      });

      expect(error).toBeDefined();
    });

    test('Should require type', async () => {
      const { error } = templateSchema.validate({
        name: 'NSF Profile'
      });

      expect(error).toBeDefined();
    });
  });

  describe('Template Type Enum', () => {
    test('Should accept valid template types', async () => {
      const validTypes = ['grant_profile', 'budget_template', 'narrative_template'];

      for (const type of validTypes) {
        const { error } = templateSchema.validate({
          name: 'Test Template',
          type
        });

        expect(error).toBeUndefined();
      }
    });

    test('Should reject invalid template types', async () => {
      const invalidTypes = ['profile', 'budget', 'narrative', 'other_type'];

      for (const type of invalidTypes) {
        const { error } = templateSchema.validate({
          name: 'Test Template',
          type
        });

        expect(error).toBeDefined();
      }
    });
  });

  describe('Optional Template Fields', () => {
    test('Should accept optional description', async () => {
      const { error } = templateSchema.validate({
        name: 'Test Template',
        type: 'grant_profile',
        description: 'Template for NSF grants'
      });

      expect(error).toBeUndefined();
    });

    test('Should reject description > 1000 chars', async () => {
      const longDesc = 'a'.repeat(1001);
      const { error } = templateSchema.validate({
        name: 'Test Template',
        type: 'grant_profile',
        description: longDesc
      });

      expect(error).toBeDefined();
    });

    test('Should accept optional content object', async () => {
      const { error } = templateSchema.validate({
        name: 'Test Template',
        type: 'grant_profile',
        content: { key: 'value', nested: { field: 'data' } }
      });

      expect(error).toBeUndefined();
    });
  });
});

describe('Validation Middleware Integration', () => {
  test('Should pass valid search query', () => {
    const query = {
      status: 'draft',
      page: 2,
      limit: 10
    };

    const { error } = searchQuerySchema.validate(query);
    expect(error).toBeUndefined();
  });

  test('Should fail on multiple validation errors', () => {
    const query = {
      status: 'invalid',
      page: -1,
      amount_min: 100000,
      amount_max: 50000
    };

    const { error, value } = searchQuerySchema.validate(query, { abortEarly: false });
    expect(error).toBeDefined();
    expect(error.details.length).toBeGreaterThanOrEqual(2);
  });

  test('Should sanitize and provide validated values', () => {
    const query = {
      page: '2',
      limit: '10',
      status: 'draft'
    };

    const { value } = searchQuerySchema.validate(query);
    expect(typeof value.page).toBe('number');
    expect(value.page).toBe(2);
    expect(value.limit).toBe(10);
  });
});
