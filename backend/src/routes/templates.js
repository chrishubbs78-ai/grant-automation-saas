const express = require('express');
const { verifyToken } = require('../middleware/auth');
const validateSearch = require('../middleware/validateSearch');
const { Template, Organization } = require('../models');
const router = express.Router();

// GET all templates for organization (with filtering)
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

    const { type } = req.query;
    const where = { org_id: org.id };

    // Filter by type if provided
    if (type) {
      where.type = type;
    }

    const templates = await Template.findAll({
      where,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: templates,
      metadata: { total: templates.length }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET single template by ID
router.get('/:id', verifyToken, async (req, res) => {
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

    const template = await Template.findOne({
      where: { id: req.params.id, org_id: org.id }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST create template
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, type, description, content, tags } = req.body;

    // Validate required fields
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: 'name and type are required'
      });
    }

    // Validate type enum
    const validTypes = ['grant_profile', 'budget_template', 'narrative_template'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const org = await Organization.findOne({
      where: { userId: req.user.userId }
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const template = await Template.create({
      org_id: org.id,
      name,
      type,
      description: description || null,
      content: content || null,
      tags: tags || []
    });

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT update template
router.put('/:id', verifyToken, async (req, res) => {
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

    const template = await Template.findByPk(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Verify ownership
    if (template.org_id !== org.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Whitelist updatable fields
    const ALLOWED_FIELDS = ['name', 'type', 'description', 'content', 'tags', 'is_public'];
    const updateData = Object.keys(req.body)
      .filter(key => ALLOWED_FIELDS.includes(key))
      .reduce((obj, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    // Validate type if provided
    if (updateData.type) {
      const validTypes = ['grant_profile', 'budget_template', 'narrative_template'];
      if (!validTypes.includes(updateData.type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid type. Must be one of: ${validTypes.join(', ')}`
        });
      }
    }

    await template.update(updateData);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE template
router.delete('/:id', verifyToken, async (req, res) => {
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

    const template = await Template.findByPk(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Verify ownership
    if (template.org_id !== org.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    await template.destroy();

    res.json({
      success: true,
      data: { id: template.id }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST duplicate/clone template
router.post('/:id/duplicate', verifyToken, async (req, res) => {
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

    const template = await Template.findByPk(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    // Verify ownership
    if (template.org_id !== org.id) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    // Create duplicate with "_copy" suffix
    const duplicated = await Template.create({
      org_id: org.id,
      name: `${template.name} (copy)`,
      type: template.type,
      description: template.description,
      content: template.content ? JSON.parse(JSON.stringify(template.content)) : null,
      tags: template.tags ? [...template.tags] : []
    });

    res.status(201).json({
      success: true,
      data: duplicated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
