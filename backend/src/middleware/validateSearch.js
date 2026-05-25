const validateSearch = (req, res, next) => {
  const { page, limit, status, sort, deadline_before, deadline_after, amount_min, amount_max, funder } = req.query;

  const errors = [];

  // Validate pagination
  if (page !== undefined) {
    const pageNum = parseInt(page, 10);
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      errors.push('page must be a positive integer');
    }
  }

  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
      errors.push('limit must be a positive integer between 1 and 100');
    }
  }

  // Validate status
  if (status !== undefined) {
    const allowedStatuses = ['draft', 'submitted', 'pending', 'funded', 'rejected'];
    const statusArray = status.split(',').map(s => s.trim());
    const invalidStatuses = statusArray.filter(s => !allowedStatuses.includes(s));
    if (invalidStatuses.length > 0) {
      errors.push(`invalid status values: ${invalidStatuses.join(', ')}. Allowed: ${allowedStatuses.join(', ')}`);
    }
  }

  // Validate sort
  if (sort !== undefined) {
    const validSorts = ['deadline:asc', 'deadline:desc', 'amount:asc', 'amount:desc', 'created_at:asc', 'created_at:desc'];
    if (!validSorts.includes(sort)) {
      errors.push(`invalid sort value: ${sort}. Valid options: ${validSorts.join(', ')}`);
    }
  }

  // Validate dates
  if (deadline_before !== undefined) {
    const date = new Date(deadline_before);
    if (isNaN(date.getTime())) {
      errors.push('deadline_before must be a valid ISO 8601 date');
    }
  }

  if (deadline_after !== undefined) {
    const date = new Date(deadline_after);
    if (isNaN(date.getTime())) {
      errors.push('deadline_after must be a valid ISO 8601 date');
    }
  }

  // Validate amounts
  if (amount_min !== undefined) {
    const amountNum = parseFloat(amount_min);
    if (isNaN(amountNum) || amountNum < 0) {
      errors.push('amount_min must be a non-negative number');
    }
  }

  if (amount_max !== undefined) {
    const amountNum = parseFloat(amount_max);
    if (isNaN(amountNum) || amountNum < 0) {
      errors.push('amount_max must be a non-negative number');
    }
  }

  // Validate amount range logic
  if (amount_min !== undefined && amount_max !== undefined) {
    const min = parseFloat(amount_min);
    const max = parseFloat(amount_max);
    if (!isNaN(min) && !isNaN(max) && min > max) {
      errors.push('amount_min must be less than or equal to amount_max');
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

module.exports = validateSearch;
