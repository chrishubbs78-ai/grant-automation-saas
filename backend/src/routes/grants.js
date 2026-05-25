const express = require('express');
const { Op } = require('sequelize');
const { verifyToken } = require('../middleware/auth');
const validateSearch = require('../middleware/validateSearch');
const { Grant, Organization } = require('../models');
const router = express.Router();

// GET all grants for org (with filtering, pagination, and sorting)
router.get('/', verifyToken, validateSearch, async (req, res) => {
  try {
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Extract and normalize query parameters
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;
    const search = req.query.search ? req.query.search.trim() : '';
    const status = req.query.status ? req.query.status.split(',').map(s => s.trim()) : [];
    const funder = req.query.funder ? req.query.funder.trim() : '';
    const deadline_before = req.query.deadline_before;
    const deadline_after = req.query.deadline_after;
    const amount_min = req.query.amount_min ? parseFloat(req.query.amount_min) : null;
    const amount_max = req.query.amount_max ? parseFloat(req.query.amount_max) : null;
    const sort = req.query.sort || 'deadline:asc';

    // Build WHERE clause
    const where = { org_id: org.id };

    // Full-text search on funder_name
    if (search) {
      where.funder_name = { [Op.iLike]: `%${search}%` };
    }

    // Status filter
    if (status.length > 0) {
      where.status = { [Op.in]: status };
    }

    // Funder exact match
    if (funder) {
      where.funder_name = { [Op.iLike]: `%${funder}%` };
    }

    // Deadline range
    if (deadline_before || deadline_after) {
      where.deadline = {};
      if (deadline_before) {
        where.deadline[Op.lte] = new Date(deadline_before);
      }
      if (deadline_after) {
        where.deadline[Op.gte] = new Date(deadline_after);
      }
    }

    // Amount range
    if (amount_min !== null || amount_max !== null) {
      where.amount = {};
      if (amount_min !== null) {
        where.amount[Op.gte] = amount_min;
      }
      if (amount_max !== null) {
        where.amount[Op.lte] = amount_max;
      }
    }

    // Parse sort parameter
    const [sortColumn, sortDirection] = sort.split(':');
    const order = [[sortColumn, sortDirection.toUpperCase()]];

    // Execute query with pagination
    const { count, rows } = await Grant.findAndCountAll({
      where,
      order,
      limit,
      offset,
      distinct: true
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      data: rows,
      metadata: {
        total: count,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST create grant
router.post('/', verifyToken, async (req, res) => {
  try {
    const { funder_name, deadline, amount } = req.body;

    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const grant = await Grant.create({
      org_id: org.id,
      funder_name,
      deadline,
      amount,
      status: 'draft'
    });

    res.status(201).json({
      success: true,
      data: grant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update grant
router.put('/:id', verifyToken, async (req, res) => {
  try {
    // Verify user owns the organization
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const grant = await Grant.findByPk(req.params.id);

    if (!grant) {
      return res.status(404).json({
        success: false,
        error: 'Grant not found'
      });
    }

    // Verify ownership
    if (grant.org_id !== org.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Whitelist updatable fields
    const ALLOWED_FIELDS = ['status', 'deadline', 'amount', 'notes'];
    const updateData = Object.keys(req.body)
      .filter(key => ALLOWED_FIELDS.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    await grant.update(updateData);

    res.json({
      success: true,
      data: grant
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE grant
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    // Verify user owns the organization
    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const grant = await Grant.findByPk(req.params.id);

    if (!grant) {
      return res.status(404).json({
        success: false,
        error: 'Grant not found'
      });
    }

    // Verify ownership
    if (grant.org_id !== org.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    await grant.destroy();

    res.json({
      success: true,
      data: { id: grant.id }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
