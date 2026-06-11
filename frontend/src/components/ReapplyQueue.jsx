import { useState, useEffect } from 'react';
import '../styles/reapply-queue.css';

const API = 'http://localhost:4006';
const STATUS_LABELS = { pending: 'Pending', eligible: 'Eligible', reapplied: 'Reapplied', dismissed: 'Dismissed' };
const STATUS_CLASS = { pending: 'status-pending', eligible: 'status-eligible', reapplied: 'status-reapplied', dismissed: 'status-dismissed' };

export default function ReapplyQueue({ onReapplyComplete }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState({});
  const [expanded, setExpanded] = useState({});
  const [dateOverrides, setDateOverrides] = useState({});
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const token = () => localStorage.getItem('token');

  useEffect(() => {
    scan().then(fetchCandidates);
  }, []);

  const scan = async () => {
    setScanning(true);
    try {
      await fetch(`${API}/api/reapply/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      });
    } catch { /* non-blocking */ }
    setScanning(false);
  };

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reapply/candidates`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) setCandidates(json.data);
    } catch { setError('Failed to load reapply queue'); }
    setLoading(false);
  };

  const execute = async (id) => {
    setExecuting(e => ({ ...e, [id]: true }));
    setError(null);
    try {
      const res = await fetch(`${API}/api/reapply/candidates/${id}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) {
        await fetchCandidates();
        onReapplyComplete?.(json.data);
      } else {
        setError(json.error);
      }
    } catch { setError('Reapply failed'); }
    setExecuting(e => ({ ...e, [id]: false }));
  };

  const dismiss = async (id) => {
    if (!confirm('Dismiss this candidate? You can still reapply manually later.')) return;
    try {
      await fetch(`${API}/api/reapply/candidates/${id}/dismiss`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      });
      await fetchCandidates();
    } catch { setError('Dismiss failed'); }
  };

  const toggleAutoReapply = async (id, current) => {
    try {
      const res = await fetch(`${API}/api/reapply/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ auto_reapply: !current })
      });
      const json = await res.json();
      if (json.success) setCandidates(cs => cs.map(c => c.id === id ? { ...c, auto_reapply: !current } : c));
    } catch { setError('Update failed'); }
  };

  const saveDate = async (id) => {
    const date = dateOverrides[id];
    if (!date) return;
    try {
      const res = await fetch(`${API}/api/reapply/candidates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ next_cycle_date: date })
      });
      const json = await res.json();
      if (json.success) {
        setCandidates(cs => cs.map(c => c.id === id ? { ...c, next_cycle_date: json.data.next_cycle_date } : c));
        setDateOverrides(d => { const n = { ...d }; delete n[id]; return n; });
      }
    } catch { setError('Update failed'); }
  };

  const filtered = filter === 'all' ? candidates : candidates.filter(c => c.status === filter);
  const counts = { all: candidates.length, pending: 0, eligible: 0, reapplied: 0, dismissed: 0 };
  candidates.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });

  return (
    <div className="reapply-queue">
      <div className="rq-header">
        <div>
          <h2>Reapply Queue</h2>
          <p>Rejected grants with upcoming funding cycles — improve and reapply automatically.</p>
        </div>
        <button className="btn-scan" onClick={() => scan().then(fetchCandidates)} disabled={scanning}>
          {scanning ? 'Scanning...' : '⟳ Scan Rejected Grants'}
        </button>
      </div>

      {error && <div className="rq-error">{error} <button onClick={() => setError(null)}>✕</button></div>}

      {/* Filter tabs */}
      <div className="rq-filters">
        {[['all', 'All'], ['eligible', 'Eligible Now'], ['pending', 'Pending'], ['reapplied', 'Reapplied'], ['dismissed', 'Dismissed']].map(([val, label]) => (
          <button key={val} className={`rq-filter ${filter === val ? 'active' : ''}`} onClick={() => setFilter(val)}>
            {label}
            {counts[val] > 0 && <span className="rq-count">{counts[val]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="rq-empty">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="rq-empty-state">
          <div className="rq-empty-icon">♻️</div>
          <h3>{filter === 'all' ? 'No reapply candidates yet' : `No ${filter} candidates`}</h3>
          <p>
            {filter === 'all'
              ? 'When you record a rejection outcome on a grant, it automatically appears here so you can track the next funding cycle and reapply with an improved proposal.'
              : 'Try a different filter.'}
          </p>
        </div>
      ) : (
        <div className="rq-list">
          {filtered.map(c => {
            const isExpanded = expanded[c.id];
            const nextCycle = c.next_cycle_date ? new Date(c.next_cycle_date) : null;
            const daysUntil = nextCycle ? Math.ceil((nextCycle - new Date()) / (1000 * 60 * 60 * 24)) : null;
            const isOverdue = daysUntil !== null && daysUntil < 0;

            return (
              <div key={c.id} className={`rq-card rq-card-${c.status}`}>
                <div className="rq-card-main" onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}>
                  <div className="rq-card-left">
                    <span className={`rq-status ${STATUS_CLASS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                    <div className="rq-funder">{c.funder_name || c.originalGrant?.funder_name || 'Unknown Funder'}</div>
                    {c.originalGrant?.deadline && (
                      <div className="rq-meta">
                        Originally rejected · Deadline was {new Date(c.originalGrant.deadline).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="rq-card-right">
                    {nextCycle && (
                      <div className={`rq-cycle-date ${isOverdue ? 'overdue' : daysUntil <= 60 ? 'soon' : ''}`}>
                        {isOverdue
                          ? `Cycle opened ${Math.abs(daysUntil)}d ago`
                          : daysUntil === 0 ? 'Opens today'
                          : `Next cycle in ${daysUntil}d`}
                        <div className="rq-cycle-date-val">{nextCycle.toLocaleDateString()}</div>
                      </div>
                    )}
                    <span className="rq-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="rq-card-detail">
                    {c.rejection_notes && (
                      <div className="rq-detail-block">
                        <strong>Rejection Notes</strong>
                        <p>{c.rejection_notes}</p>
                      </div>
                    )}

                    {c.status === 'reapplied' && c.newGrant && (
                      <div className="rq-detail-block rq-success-block">
                        <strong>Reapplication created</strong>
                        <p>New grant draft ready: {c.newGrant.funder_name} · Status: {c.newGrant.status}</p>
                      </div>
                    )}

                    {c.status !== 'reapplied' && c.status !== 'dismissed' && (
                      <>
                        {/* Next cycle date override */}
                        <div className="rq-detail-block">
                          <strong>Override Next Cycle Date</strong>
                          <div className="rq-date-row">
                            <input
                              type="date"
                              value={dateOverrides[c.id] || (c.next_cycle_date ? c.next_cycle_date.split('T')[0] : '')}
                              onChange={e => setDateOverrides(d => ({ ...d, [c.id]: e.target.value }))}
                            />
                            {dateOverrides[c.id] && <button className="btn-sm" onClick={() => saveDate(c.id)}>Save</button>}
                          </div>
                        </div>

                        {/* Auto-reapply toggle */}
                        <div className="rq-detail-block">
                          <div className="rq-auto-row">
                            <div>
                              <strong>Auto-Reapply</strong>
                              <p className="rq-auto-desc">Automatically execute reapply when the next cycle is within 60 days.</p>
                            </div>
                            <label className="toggle">
                              <input
                                type="checkbox"
                                checked={c.auto_reapply}
                                onChange={() => toggleAutoReapply(c.id, c.auto_reapply)}
                              />
                              <span className="toggle-slider" />
                            </label>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="rq-actions">
                          <button
                            className="btn-execute"
                            onClick={() => execute(c.id)}
                            disabled={executing[c.id]}
                          >
                            {executing[c.id] ? 'Generating improved draft...' : '↺ Reapply Now (Improved Draft)'}
                          </button>
                          <button className="btn-dismiss" onClick={() => dismiss(c.id)}>Dismiss</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
