import { API_BASE } from '../config';
import { useState, useEffect } from 'react';
import '../styles/opportunities.css';

/**
 * Ranked feed of discovered funding opportunities.
 *
 * This is the human approval gate: nothing becomes an application until the
 * user clicks Apply. Every score shows its reasoning and its concerns, because
 * a number with no explanation isn't something you can act on.
 */
export default function OpportunityFeed({ onConverted }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const token = () => localStorage.getItem('token');

  useEffect(() => { fetchMatches(); }, []);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/opportunities`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) setMatches(json.data);
      else setError(json.error || 'Could not load opportunities');
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  };

  const runDiscovery = async () => {
    setDiscovering(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE}/api/opportunities/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        if (d.source_unreachable) {
          // Distinct from "found nothing" — the search never actually ran.
          setError(
            'Could not reach the grant listings service, so nothing was searched. ' +
            'Check your internet connection and try again.'
          );
        } else {
          setNotice(
            `Scanned ${d.discovered} opportunities — ${d.scored} scored for fit, ` +
            `${d.filtered_out} ruled out on deadline or eligibility.`
          );
        }
        await fetchMatches();
      } else {
        setError(json.error || 'Discovery failed');
      }
    } catch {
      setError('Discovery failed — is the server running?');
    } finally {
      setDiscovering(false);
    }
  };

  const dismiss = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status: 'dismissed' })
      });
      const json = await res.json();
      if (json.success) setMatches(prev => prev.filter(m => m.id !== id));
      else setError(json.error);
    } catch {
      setError('Could not dismiss');
    }
  };

  const convert = async (match) => {
    try {
      const res = await fetch(`${API_BASE}/api/opportunities/${match.id}/convert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) {
        setMatches(prev => prev.filter(m => m.id !== match.id));
        setNotice(
          `Added "${match.opportunity.title}" to your grants. ` +
          `Its RFP analysis is ready — generate a draft from the grants list below.`
        );
        if (onConverted) onConverted();
      } else {
        setError(json.error || 'Could not create the application');
      }
    } catch {
      setError('Could not create the application');
    }
  };

  const scoreClass = (score) => {
    if (score === null || score === undefined) return 'score-unknown';
    if (score >= 80) return 'score-strong';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-marginal';
    return 'score-weak';
  };

  const daysUntil = (date) => {
    if (!date) return null;
    return Math.ceil((new Date(date) - Date.now()) / 86400000);
  };

  return (
    <section className="opportunities-section">
      <div className="section-header">
        <div>
          <h2>Matched Opportunities</h2>
          <p className="opp-subtitle">
            Funding opportunities scored against your profile. Nothing is submitted without your approval.
          </p>
        </div>
        <button className="btn-primary" onClick={runDiscovery} disabled={discovering}>
          {discovering ? 'Scanning…' : '🔍 Find Opportunities'}
        </button>
      </div>

      {notice && (
        <div className="opp-notice">
          {notice}
          <button onClick={() => setNotice(null)}>✕</button>
        </div>
      )}
      {error && (
        <div className="opp-error">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading ? (
        <p className="opp-empty">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="opp-empty-state">
          <div className="opp-empty-icon">🔭</div>
          <h3>No matched opportunities yet</h3>
          <p>
            Click <strong>Find Opportunities</strong> to search federal grant listings and score
            them against your organization profile. The more complete your profile and business
            plan, the sharper the matching.
          </p>
        </div>
      ) : (
        <div className="opp-list">
          {matches.map(match => {
            const opp = match.opportunity;
            const days = daysUntil(opp.close_date);
            const isOpen = expanded === match.id;

            return (
              <div key={match.id} className="opp-card">
                <div className="opp-card-main">
                  <div className={`opp-score ${scoreClass(match.fit_score)}`}>
                    <span className="opp-score-num">{match.fit_score ?? '—'}</span>
                    <span className="opp-score-label">fit</span>
                  </div>

                  <div className="opp-card-body">
                    <h3 className="opp-title">{opp.title}</h3>
                    <div className="opp-meta">
                      <span>{opp.agency || 'Unknown agency'}</span>
                      {opp.award_ceiling && (
                        <span>up to ${Number(opp.award_ceiling).toLocaleString()}</span>
                      )}
                      {days !== null && (
                        <span className={days <= 21 ? 'opp-urgent' : ''}>
                          {days < 0 ? 'Closed' : `${days} days left`}
                        </span>
                      )}
                    </div>
                    {match.rationale && <p className="opp-rationale">{match.rationale}</p>}
                  </div>

                  <div className="opp-actions">
                    <button className="btn-primary btn-sm" onClick={() => convert(match)}>
                      Apply
                    </button>
                    <button className="btn-outline btn-sm" onClick={() => dismiss(match.id)}>
                      Dismiss
                    </button>
                    <button
                      className="opp-toggle"
                      onClick={() => setExpanded(isOpen ? null : match.id)}
                    >
                      {isOpen ? 'Less' : 'Details'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="opp-detail">
                    {match.key_alignment?.length > 0 && (
                      <div className="opp-detail-block">
                        <h4>Why it fits</h4>
                        <ul>
                          {match.key_alignment.map((point, i) => <li key={i}>{point}</li>)}
                        </ul>
                      </div>
                    )}
                    {match.concerns?.length > 0 && (
                      <div className="opp-detail-block">
                        <h4>Watch out for</h4>
                        <ul className="opp-concerns">
                          {match.concerns.map((point, i) => <li key={i}>{point}</li>)}
                        </ul>
                      </div>
                    )}
                    {opp.description && (
                      <div className="opp-detail-block">
                        <h4>Opportunity summary</h4>
                        <p className="opp-description">{opp.description.substring(0, 900)}</p>
                      </div>
                    )}
                    <div className="opp-detail-footer">
                      {opp.opportunity_number && <span>#{opp.opportunity_number}</span>}
                      {opp.source_url && (
                        <a href={opp.source_url} target="_blank" rel="noreferrer">
                          View official listing ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
