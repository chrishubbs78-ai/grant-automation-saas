import React, { useState, useEffect } from 'react';
import './TemplateManager.css';

const TemplateManager = ({ onApplyTemplate, onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [selectedType, setSelectedType] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'grant_profile',
    description: '',
    content: '{}'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Filter templates when type changes
  useEffect(() => {
    if (selectedType === 'all') {
      setFilteredTemplates(templates);
    } else {
      setFilteredTemplates(templates.filter(t => t.type === selectedType));
    }
  }, [selectedType, templates]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4006/api/templates', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        setTemplates(result.data || []);
        setError(null);
      } else {
        setError('Failed to load templates');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!formData.name.trim()) {
      setError('Template name is required');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId
        ? `http://localhost:4006/api/templates/${editingId}`
        : 'http://localhost:4006/api/templates';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          description: formData.description,
          content: JSON.parse(formData.content || '{}')
        })
      });

      if (response.ok) {
        fetchTemplates();
        resetForm();
        setError(null);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save template');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:4006/api/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        fetchTemplates();
        setError(null);
      } else {
        setError('Failed to delete template');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDuplicateTemplate = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:4006/api/templates/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        fetchTemplates();
        setError(null);
      } else {
        setError('Failed to duplicate template');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleEditTemplate = (template) => {
    setFormData({
      name: template.name,
      type: template.type,
      description: template.description || '',
      content: JSON.stringify(template.content || {}, null, 2)
    });
    setEditingId(template.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'grant_profile',
      description: '',
      content: '{}'
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleApplyTemplate = (template) => {
    if (onApplyTemplate) {
      onApplyTemplate(template);
    }
  };

  const typeLabels = {
    grant_profile: 'Grant Profile',
    budget_template: 'Budget Template',
    narrative_template: 'Narrative Template'
  };

  if (loading) {
    return <div className="template-manager"><p>Loading templates...</p></div>;
  }

  return (
    <div className="template-manager">
      <div className="template-manager-header">
        <h3>Template Library</h3>
        <button className="btn-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="error-message">❌ {error}</div>}

      {/* Type Filter */}
      <div className="template-filters">
        {['all', 'grant_profile', 'budget_template', 'narrative_template'].map(type => (
          <button
            key={type}
            className={`filter-btn ${selectedType === type ? 'active' : ''}`}
            onClick={() => setSelectedType(type)}
          >
            {type === 'all' ? 'All Templates' : typeLabels[type]}
          </button>
        ))}
      </div>

      {/* Add Template Button */}
      <button
        className="btn-new-template"
        onClick={() => setShowForm(!showForm)}
      >
        {showForm ? '✕ Close Form' : '+ New Template'}
      </button>

      {/* Template Form */}
      {showForm && (
        <div className="template-form">
          <div className="form-group">
            <label>Template Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., NSF Standard Grant Profile"
            />
          </div>

          <div className="form-group">
            <label>Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              {Object.entries(typeLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe when to use this template..."
              rows="2"
            />
          </div>

          <div className="form-group">
            <label>Content (JSON)</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder='{"key": "value"}'
              rows="6"
              className="json-textarea"
            />
          </div>

          <div className="form-actions">
            <button className="btn-save" onClick={handleSaveTemplate}>
              {editingId ? '💾 Update Template' : '💾 Save Template'}
            </button>
            <button className="btn-cancel" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Templates List */}
      <div className="templates-list">
        {filteredTemplates.length === 0 ? (
          <div className="empty-templates">
            <p>No templates yet. Create one to get started!</p>
          </div>
        ) : (
          filteredTemplates.map(template => (
            <div key={template.id} className="template-card">
              <div className="template-header">
                <div>
                  <h4>{template.name}</h4>
                  <span className="template-type">{typeLabels[template.type]}</span>
                </div>
                <span className="usage-count">{template.usage_count} uses</span>
              </div>

              {template.description && (
                <p className="template-description">{template.description}</p>
              )}

              <div className="template-actions">
                <button
                  className="btn-apply"
                  onClick={() => handleApplyTemplate(template)}
                  title="Apply this template to a new grant"
                >
                  Apply
                </button>
                <button
                  className="btn-edit"
                  onClick={() => handleEditTemplate(template)}
                >
                  Edit
                </button>
                <button
                  className="btn-duplicate"
                  onClick={() => handleDuplicateTemplate(template.id)}
                  title="Create a copy of this template"
                >
                  Duplicate
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDeleteTemplate(template.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TemplateManager;
