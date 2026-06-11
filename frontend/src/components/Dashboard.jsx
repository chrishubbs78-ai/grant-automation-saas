import { useState, useEffect } from 'react';
import RFPUploader from './RFPUploader';
import SearchFilter from './SearchFilter';
import TemplateManager from './TemplateManager';
import BulkActionsToolbar from './BulkActionsToolbar';
import BulkJobMonitor from './BulkJobMonitor';
import FinancialsVault from './FinancialsVault';
import ReapplyQueue from './ReapplyQueue';
import '../styles/dashboard.css';

export default function Dashboard({ orgProfile }) {
  const [grants, setGrants] = useState([]);
  const [stats, setStats] = useState({
    submitted: 0,
    funded: 0,
    pending: 0
  });

  // Filter and pagination state
  const [currentFilters, setCurrentFilters] = useState({});
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false
  });

  // RFP analysis state
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [rfpAnalysis, setRfpAnalysis] = useState(null);
  const [polling, setPolling] = useState(false);
  const [pollingError, setPollingError] = useState(null);

  // Draft generation state
  const [draftJobId, setDraftJobId] = useState(null);
  const [draftStatus, setDraftStatus] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftPolling, setDraftPolling] = useState(false);

  // Analytics and outcome state
  const [analytics, setAnalytics] = useState(null);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [selectedGrantForOutcome, setSelectedGrantForOutcome] = useState(null);
  const [outcomeForm, setOutcomeForm] = useState({
    funded: null,
    funder_type: '',
    amount_bracket: '',
    outcome_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  // Template manager state
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showFinancialsVault, setShowFinancialsVault] = useState(false);

  // Bulk operations state
  const [selectedGrants, setSelectedGrants] = useState(new Set());
  const [currentBulkJobId, setCurrentBulkJobId] = useState(null);

  useEffect(() => {
    fetchGrants();
    fetchAnalytics();
  }, []);

  // Poll RFP job status
  useEffect(() => {
    if (!jobId || !polling) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`http://localhost:4006/api/rfp/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();

        if (json.success) {
          setJobStatus(json.data.status);

          if (json.data.status === 'complete') {
            setRfpAnalysis(json.data.rfpAnalysis);
            setPolling(false);
            setPollingError(null);
          } else if (json.data.status === 'error') {
            console.error('RFP parsing failed:', json.data.error);
            setPollingError(json.data.error);
            setPolling(false);
          }
        }
      } catch (error) {
        console.error('Poll error:', error);
        setPollingError(error.message);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, polling]);

  // Poll draft job status
  useEffect(() => {
    if (!draftJobId || !draftPolling) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`http://localhost:4006/api/drafts/${draftJobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();

        if (json.success) {
          setDraftStatus(json.data.status);

          if (json.data.status === 'complete') {
            setDraft(json.data.draft);
            setDraftPolling(false);
          } else if (json.data.status === 'error') {
            console.error('Draft generation failed:', json.data.error);
            setDraftPolling(false);
          }
        }
      } catch (error) {
        console.error('Draft poll error:', error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [draftJobId, draftPolling]);

  const fetchGrants = async (filters = {}, pageNum = 1) => {
    try {
      const token = localStorage.getItem('token');

      // Build query string
      const params = new URLSearchParams();
      params.set('page', pageNum);
      params.set('limit', pagination.limit);

      // Add filters to query
      if (filters.search) params.set('search', filters.search);
      if (filters.status && filters.status.length > 0) params.set('status', filters.status.join(','));
      if (filters.funder) params.set('funder', filters.funder);
      if (filters.deadline_before) params.set('deadline_before', filters.deadline_before);
      if (filters.deadline_after) params.set('deadline_after', filters.deadline_after);
      if (filters.amount_min) params.set('amount_min', filters.amount_min);
      if (filters.amount_max) params.set('amount_max', filters.amount_max);
      if (filters.sort) params.set('sort', filters.sort);

      const response = await fetch(`http://localhost:4006/api/grants?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();

      if (result.success) {
        setGrants(result.data);
        setPagination({
          page: result.metadata.page,
          limit: result.metadata.limit,
          total: result.metadata.total,
          totalPages: result.metadata.totalPages,
          hasMore: result.metadata.hasMore
        });
        updateStats(result.data);
      }
    } catch (error) {
      console.error('Error fetching grants:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4006/api/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await response.json();

      if (result.success) {
        setAnalytics(result.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const updateStats = (grantsList) => {
    setStats({
      submitted: grantsList.length,
      funded: grantsList.filter(g => g.status === 'funded').length,
      pending: grantsList.filter(g => g.status === 'pending').length
    });
  };

  const handleRecordOutcome = async () => {
    if (!selectedGrantForOutcome || outcomeForm.funded === null) {
      alert('Please select funded/rejected and a grant');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `http://localhost:4006/api/outcomes/${selectedGrantForOutcome}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(outcomeForm)
        }
      );

      const result = await response.json();

      if (result.success) {
        // Refresh data
        fetchGrants();
        fetchAnalytics();
        setShowOutcomeModal(false);
        setSelectedGrantForOutcome(null);
        setOutcomeForm({
          funded: null,
          funder_type: '',
          amount_bracket: '',
          outcome_date: new Date().toISOString().split('T')[0],
          notes: ''
        });
        alert('✅ Outcome recorded! Analytics updated.');
      } else {
        alert('❌ Error: ' + result.error);
      }
    } catch (error) {
      console.error('Outcome submission error:', error);
      alert('Error recording outcome');
    }
  };

  const handleUploadComplete = (uploadData) => {
    setJobId(uploadData.jobId);
    setJobStatus('processing');
    setPolling(true);
    setPollingError(null);
    setRfpAnalysis(null);
    setDraft(null);
    setDraftJobId(null);
  };

  const handleGenerateDraft = async () => {
    if (!jobId) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4006/api/drafts/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rfpAnalysisId: jobId })
      });

      const json = await res.json();
      if (json.success) {
        setDraftJobId(json.data.jobId);
        setDraftStatus('processing');
        setDraftPolling(true);
      } else {
        console.error('Draft generation failed:', json.error);
      }
    } catch (error) {
      console.error('Draft generation error:', error);
    }
  };

  const handleApplyFilters = (filters) => {
    setCurrentFilters(filters);
    fetchGrants(filters, 1);
  };

  const handleResetFilters = () => {
    setCurrentFilters({});
    fetchGrants({}, 1);
  };

  const handleApplyTemplate = (template) => {
    // For now, close the template manager
    // In a full implementation, this would pre-fill a grant form with template data
    setShowTemplateManager(false);
    alert(`✅ Template "${template.name}" applied! (Feature in development)`);
  };

  const handleToggleGrantSelection = (grantId) => {
    const newSelected = new Set(selectedGrants);
    if (newSelected.has(grantId)) {
      newSelected.delete(grantId);
    } else {
      newSelected.add(grantId);
    }
    setSelectedGrants(newSelected);
  };

  const handleSelectAllGrants = () => {
    if (selectedGrants.size === grants.length) {
      setSelectedGrants(new Set());
    } else {
      setSelectedGrants(new Set(grants.map(g => g.id)));
    }
  };

  const handleBulkUpdateStatus = async (grantIds, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4006/api/bulk/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          grant_ids: Array.from(grantIds),
          new_status: newStatus
        })
      });

      const result = await response.json();
      if (result.success) {
        setCurrentBulkJobId(result.data.id);
        setSelectedGrants(new Set());
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      console.error('Bulk update error:', error);
      alert('Error updating grants');
    }
  };

  const handleBulkExportCSV = async (grantIds) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4006/api/bulk/export-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          grant_ids: Array.from(grantIds)
        })
      });

      const result = await response.json();
      if (result.success) {
        setCurrentBulkJobId(result.data.id);
      } else {
        alert('Error: ' + result.error);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting CSV');
    }
  };

  const handleClearBulkSelection = () => {
    setSelectedGrants(new Set());
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <h1>Grant Dashboard</h1>
          <p>{orgProfile.name || 'Grant Organization'}</p>
        </div>
      </header>

      <div className="dashboard-main">
        {/* RFP Upload Section */}
        <section className="rfp-section">
          <div className="section-header">
            <h2>Upload RFP or Grant Opportunity</h2>
            <div className="header-buttons">
              <button className="btn-templates" onClick={() => setShowFinancialsVault(true)} title="Secure financial documents">
                🔒 Financials
              </button>
              <button className="btn-templates" onClick={() => setShowTemplateManager(true)} title="Browse and apply saved templates">
                📋 Templates
              </button>
            </div>
          </div>
          <RFPUploader onUploadComplete={handleUploadComplete} />
        </section>

        {/* RFP Analysis Results */}
        {jobStatus && (
          <section className="analysis-section">
            <h2>RFP Analysis</h2>

            {jobStatus === 'processing' && (
              <div className="processing-message">
                <p>🔄 Parsing RFP with Claude and researching funder with Gemini...</p>
              </div>
            )}

            {pollingError && (
              <div className="error-message">
                <p>❌ Error: {pollingError}</p>
              </div>
            )}

            {rfpAnalysis && (
              <div className="analysis-results">
                <div className="result-field">
                  <label>Funder Name:</label>
                  <span>{rfpAnalysis.funder_name || 'Not detected'}</span>
                </div>

                <div className="result-field">
                  <label>Deadline:</label>
                  <span>{rfpAnalysis.deadline || 'Not specified'}</span>
                </div>

                <div className="result-field">
                  <label>Award Range:</label>
                  <span>
                    {rfpAnalysis.award_range?.min || 'N/A'} - {rfpAnalysis.award_range?.max || 'N/A'}
                  </span>
                </div>

                <div className="result-field">
                  <label>Page Limit:</label>
                  <span>{rfpAnalysis.page_limit || 'Not specified'}</span>
                </div>

                <div className="result-field">
                  <label>Key Requirements:</label>
                  <ul>
                    {rfpAnalysis.key_requirements?.map((req, idx) => (
                      <li key={idx}>{req}</li>
                    )) || <li>None extracted</li>}
                  </ul>
                </div>

                <div className="result-field">
                  <label>Evaluation Criteria:</label>
                  <ul>
                    {Object.entries(rfpAnalysis.evaluation_criteria || {}).map(([key, val]) => (
                      <li key={key}>
                        <strong>{key}:</strong> {val}
                      </li>
                    )) || <li>None specified</li>}
                  </ul>
                </div>

                {/* Expert Draft Sections */}
                {draft ? (
                  <div className="draft-section">
                    <div className="draft-header">
                      <h3>✅ Expert Grant Proposal Draft</h3>
                      <div className="draft-header-actions">
                        {jobStatus === 'complete' && rfpAnalysis && (
                          <a
                            className="btn-download-docx"
                            href={`http://localhost:4006/api/export/grants/${draft?.grant_id}/docx`}
                            target="_blank"
                            rel="noreferrer"
                            title="Download formatted Word document"
                            onClick={e => {
                              e.preventDefault();
                              const token = localStorage.getItem('token');
                              fetch(`http://localhost:4006/api/export/grants/${draft?.grant_id}/docx`, {
                                headers: { Authorization: `Bearer ${token}` }
                              }).then(r => r.blob()).then(blob => {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `Proposal_${rfpAnalysis.funder_name || 'Grant'}.docx`;
                                a.click();
                                URL.revokeObjectURL(url);
                              });
                            }}
                          >
                            ⬇ Download .docx
                          </a>
                        )}
                        <button className="btn-copy-draft" onClick={() => {
                        const full = [
                          draft.executive_summary && `EXECUTIVE SUMMARY\n${draft.executive_summary}`,
                          draft.organization_background && `ORGANIZATION BACKGROUND\n${draft.organization_background}`,
                          draft.statement_of_need && `STATEMENT OF NEED\n${draft.statement_of_need}`,
                          (draft.goals_and_objectives || draft.impact_statement) && `GOALS & OBJECTIVES\n${draft.goals_and_objectives || draft.impact_statement}`,
                          draft.program_design && `PROGRAM DESIGN\n${draft.program_design}`,
                          draft.evaluation_plan && `EVALUATION PLAN\n${draft.evaluation_plan}`,
                          draft.sustainability_plan && `SUSTAINABILITY PLAN\n${draft.sustainability_plan}`,
                          draft.budget_narrative && `BUDGET NARRATIVE\n${draft.budget_narrative}`
                        ].filter(Boolean).join('\n\n---\n\n');
                        navigator.clipboard.writeText(full);
                        alert('Full draft copied to clipboard!');
                      }}
                      >📋 Copy Full Draft</button>
                      </div>
                    </div>
                    <div className="draft-content">
                      {draft.executive_summary && (
                        <div className="draft-section-item">
                          <h4>Executive Summary</h4>
                          <p>{draft.executive_summary}</p>
                        </div>
                      )}
                      {draft.organization_background && (
                        <div className="draft-section-item">
                          <h4>Organization Background</h4>
                          <p>{draft.organization_background}</p>
                        </div>
                      )}
                      {(draft.statement_of_need || draft.problem_statement) && (
                        <div className="draft-section-item">
                          <h4>Statement of Need</h4>
                          <p>{draft.statement_of_need || draft.problem_statement}</p>
                        </div>
                      )}
                      {(draft.goals_and_objectives || draft.impact_statement) && (
                        <div className="draft-section-item">
                          <h4>Goals & Objectives</h4>
                          <p>{draft.goals_and_objectives || draft.impact_statement}</p>
                        </div>
                      )}
                      {draft.program_design && (
                        <div className="draft-section-item">
                          <h4>Program Design & Methodology</h4>
                          <p>{draft.program_design}</p>
                        </div>
                      )}
                      {draft.evaluation_plan && (
                        <div className="draft-section-item">
                          <h4>Evaluation Plan</h4>
                          <p>{draft.evaluation_plan}</p>
                        </div>
                      )}
                      {draft.sustainability_plan && (
                        <div className="draft-section-item">
                          <h4>Sustainability Plan</h4>
                          <p>{draft.sustainability_plan}</p>
                        </div>
                      )}
                      {draft.budget_narrative && (
                        <div className="draft-section-item">
                          <h4>Budget Narrative</h4>
                          <p>{draft.budget_narrative}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={handleGenerateDraft}
                    disabled={draftPolling}
                  >
                    {draftPolling ? '⏳ Generating Draft...' : '✍️ Generate Draft'}
                  </button>
                )}

                {draftStatus === 'processing' && (
                  <div className="processing-message">
                    <p>🔄 Claude is generating draft sections...</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Quick Stats */}
        <section className="stats-section">
          <h2>Quick Stats</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{stats.submitted}</div>
              <div className="stat-label">Submitted</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.funded}</div>
              <div className="stat-label">Funded</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
        </section>

        {/* Analytics & Learning Dashboard */}
        {analytics && analytics.total_submitted > 0 && (
          <section className="analytics-section">
            <h2>📊 Learning Dashboard</h2>

            <div className="analytics-grid">
              <div className="metric-card">
                <div className="metric-label">Win Rate</div>
                <div className="metric-value">{analytics.win_rate.toFixed(1)}%</div>
                <div className="metric-subtext">
                  {analytics.total_funded} funded of {analytics.total_submitted} submitted
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label">Avg Award</div>
                <div className="metric-value">
                  ${(analytics.avg_award_amount || 0).toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 0
                  })}
                </div>
              </div>

              {Object.entries(analytics.win_rate_by_funder_type || {}).map(([type, rate]) => (
                <div key={type} className="metric-card">
                  <div className="metric-label">{type}</div>
                  <div className="metric-value">{rate.toFixed(1)}%</div>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {analytics.recommendations && analytics.recommendations.length > 0 && (
              <div className="recommendations-section">
                <h3>🎯 Recommendations</h3>
                {analytics.recommendations.map((rec, idx) => (
                  <div key={idx} className={`recommendation recommendation-${rec.type}`}>
                    {rec.message}
                  </div>
                ))}
              </div>
            )}

            {/* Success Funders */}
            {analytics.success_funders && analytics.success_funders.length > 0 && (
              <div className="success-funders-section">
                <h3>✨ Funders Who Funded You</h3>
                <ul>
                  {analytics.success_funders.map((funder, idx) => (
                    <li key={idx}>{funder}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Reapply Queue */}
        <ReapplyQueue onReapplyComplete={() => { fetchGrants(currentFilters, pagination.page); fetchAnalytics(); }} />

        {/* Grants List */}
        <section className="grants-section">
          <div className="section-header">
            <h2>Your Grants</h2>
            <div className="result-count">
              {pagination.total > 0 && (
                <span>
                  Showing {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </span>
              )}
            </div>
          </div>

          {/* Search and Filter Component */}
          <SearchFilter
            onApplyFilters={handleApplyFilters}
            onReset={handleResetFilters}
          />

          {/* Bulk Actions Toolbar */}
          {selectedGrants.size > 0 && (
            <BulkActionsToolbar
              selectedGrants={selectedGrants}
              onBulkUpdateStatus={handleBulkUpdateStatus}
              onBulkExportCSV={handleBulkExportCSV}
              onClearSelection={handleClearBulkSelection}
            />
          )}

          {grants.length === 0 ? (
            <div className="empty-state">
              {Object.keys(currentFilters).length > 0 ? (
                <p>No grants match your filters. Try adjusting your search.</p>
              ) : (
                <p>No grants yet. Start by uploading an RFP or grant opportunity.</p>
              )}
            </div>
          ) : (
            <div className="grants-list">
              {grants.length > 1 && (
                <div className="select-all-header">
                  <input
                    type="checkbox"
                    checked={selectedGrants.size === grants.length && grants.length > 0}
                    onChange={handleSelectAllGrants}
                    title="Select all grants on this page"
                  />
                  <span className="select-all-label">
                    {selectedGrants.size === grants.length && grants.length > 0
                      ? 'Deselect All'
                      : 'Select All'}
                  </span>
                </div>
              )}
              {grants.map(grant => (
                <div
                  key={grant.id}
                  className={`grant-card ${selectedGrants.has(grant.id) ? 'selected' : ''}`}
                >
                  <div className="grant-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedGrants.has(grant.id)}
                      onChange={() => handleToggleGrantSelection(grant.id)}
                    />
                  </div>
                  <div className="grant-content">
                    <div className="grant-header">
                      <h3>{grant.funder_name || 'Untitled Grant'}</h3>
                      <span className={`status status-${grant.status}`}>
                        {grant.status}
                      </span>
                    </div>
                    <div className="grant-details">
                      {grant.amount && <p><strong>Amount:</strong> ${grant.amount.toLocaleString()}</p>}
                      {grant.deadline && <p><strong>Deadline:</strong> {new Date(grant.deadline).toLocaleDateString()}</p>}
                    </div>
                    {grant.status === 'submitted' && (
                      <button
                        className="btn-record-outcome"
                        onClick={() => {
                          setSelectedGrantForOutcome(grant.id);
                          setShowOutcomeModal(true);
                        }}
                      >
                        📝 Record Outcome
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="pagination-controls">
              <button
                disabled={pagination.page === 1}
                onClick={() => fetchGrants(currentFilters, pagination.page - 1)}
                className="btn-pagination"
              >
                ← Previous
              </button>
              <span className="page-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                disabled={!pagination.hasMore}
                onClick={() => fetchGrants(currentFilters, pagination.page + 1)}
                className="btn-pagination"
              >
                Next →
              </button>
            </div>
          )}
        </section>

        {/* Outcome Modal */}
        {showOutcomeModal && (
          <div className="modal-overlay" onClick={() => setShowOutcomeModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Record Grant Outcome</h3>
                <button
                  className="modal-close"
                  onClick={() => setShowOutcomeModal(false)}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label>Did you get funded?</label>
                  <div className="radio-group">
                    <label>
                      <input
                        type="radio"
                        name="funded"
                        value="true"
                        checked={outcomeForm.funded === true}
                        onChange={() => setOutcomeForm({ ...outcomeForm, funded: true })}
                      />
                      ✅ Yes, Funded
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="funded"
                        value="false"
                        checked={outcomeForm.funded === false}
                        onChange={() => setOutcomeForm({ ...outcomeForm, funded: false })}
                      />
                      ❌ No, Rejected
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Funder Type</label>
                  <select
                    value={outcomeForm.funder_type}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, funder_type: e.target.value })}
                  >
                    <option value="">Select type...</option>
                    <option value="foundation">Foundation</option>
                    <option value="government">Government</option>
                    <option value="corporate">Corporate</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Amount Bracket (if funded)</label>
                  <select
                    value={outcomeForm.amount_bracket}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, amount_bracket: e.target.value })}
                  >
                    <option value="">Select range...</option>
                    <option value="<$50K">&lt; $50K</option>
                    <option value="$50K-$100K">$50K - $100K</option>
                    <option value="$100K-$500K">$100K - $500K</option>
                    <option value="$500K+">$500K+</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Outcome Date</label>
                  <input
                    type="date"
                    value={outcomeForm.outcome_date}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, outcome_date: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={outcomeForm.notes}
                    onChange={(e) => setOutcomeForm({ ...outcomeForm, notes: e.target.value })}
                    placeholder="What did you learn? Any feedback?"
                    rows="3"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  onClick={() => setShowOutcomeModal(false)}
                >
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleRecordOutcome}>
                  Save Outcome
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template Manager Modal */}
        {showTemplateManager && (
          <div className="modal-overlay" onClick={() => setShowTemplateManager(false)}>
            <div className="modal-content-large" onClick={e => e.stopPropagation()}>
              <TemplateManager
                onApplyTemplate={handleApplyTemplate}
                onClose={() => setShowTemplateManager(false)}
              />
            </div>
          </div>
        )}

        {/* Financials Vault */}
        {showFinancialsVault && (
          <FinancialsVault onClose={() => setShowFinancialsVault(false)} />
        )}

        {/* Bulk Job Monitor */}
        {currentBulkJobId && (
          <BulkJobMonitor
            jobId={currentBulkJobId}
            onComplete={() => {
              // Refresh grants after bulk operation completes
              fetchGrants(currentFilters, pagination.page);
            }}
            onClose={() => setCurrentBulkJobId(null)}
          />
        )}

      </div>
    </div>
  );
}
