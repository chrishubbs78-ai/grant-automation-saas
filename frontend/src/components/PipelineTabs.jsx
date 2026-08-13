import { API_BASE } from '../config';
import { useState, useEffect, useCallback } from 'react';
import ApplicationDocuments from './ApplicationDocuments';
import '../styles/pipeline.css';

/**
 * The application pipeline as four tabs.
 *
 * Bucketing comes from /api/pipeline rather than being recomputed here, so the
 * dashboard and any other surface always agree on what "filed" means.
 */

const TABS = [
  { key: 'found',    label: 'Found',    blurb: 'Opportunities and applications you have not sent yet' },
  { key: 'filed',    label: 'Filed',    blurb: 'With the funder, waiting on an answer' },
  { key: 'past',     label: 'Past',     blurb: 'Deadline gone by, or a decision came back' },
  { key: 'reopened', label: 'Reopened', blurb: 'Rejected grants whose next cycle is open again' }
];

export default function PipelineTabs({ onChanged }) {
  const [data, setData] = useState(null);
  const [active, setActive] = useState('found');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openDocs, setOpenDocs] = useState(null);

  const token = () => localStorage.getItem('token');

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/pipeline`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) { setData(json.data); setError(null); }
      else setError(json.error || 'Could not load your pipeline');
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const count = (key) => (data ? data[key].count : null);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const daysLeft = (d) => d ? Math.ceil((new Date(d) - Date.now()) / 86400000) : null;
  const money = (n) => n ? `$${Number(n).toLocaleString()}` : null;

  /** Document readiness, shown wherever an application appears. */
  const DocChip = ({ grant }) => {
    const docs = grant.documents;
    if (!docs || docs.required === 0) {
      return (
        <button className="pl-docbtn" onClick={() => setOpenDocs(grant)}>
          Add document checklist
        </button>
      );
    }
    return (
      <button
        className={`pl-docbtn ${docs.complete ? 'ok' : 'warn'}`}
        onClick={() => setOpenDocs(grant)}
        title={docs.missing.length ? `Still needed: ${docs.missing.join(', ')}` : 'All required documents attached'}
      >
        {docs.attached}/{docs.required} documents
        {!docs.complete && docs.missing.length > 0 && ` — missing ${docs.missing[0]}${docs.missing.length > 1 ? ` +${docs.missing.length - 1}` : ''}`}
      </button>
    );
  };

  const GrantRow = ({ grant, showDocs = true, trailing }) => {
    const days = daysLeft(grant.deadline);
    return (
      <div className="pl-row">
        <div className="pl-row-main">
          <span className="pl-funder">{grant.funder_name || 'Untitled application'}</span>
          <div className="pl-meta">
            {grant.amount && <span>{money(grant.amount)}</span>}
            {grant.deadline && (
              <span className={days !== null && days < 0 ? 'past' : days !== null && days <= 14 ? 'urgent' : ''}>
                {days !== null && days < 0 ? `Closed ${fmtDate(grant.deadline)}` : `Due ${fmtDate(grant.deadline)}`}
              </span>
            )}
            {trailing}
          </div>
        </div>
        {showDocs && <DocChip grant={grant} />}
      </div>
    );
  };

  const Empty = ({ children }) => <p className="pl-empty">{children}</p>;

  const renderTab = () => {
    if (!data) return null;

    if (active === 'found') {
      const { opportunities, drafts } = data.found;
      if (!opportunities.length && !drafts.length) {
        return <Empty>Nothing here yet. Run a discovery scan to find opportunities that match your profile.</Empty>;
      }
      return (
        <>
          {drafts.length > 0 && (
            <section className="pl-group">
              <h3>Started, not yet sent <span className="pl-n">{drafts.length}</span></h3>
              {drafts.map(g => <GrantRow key={g.id} grant={g} />)}
            </section>
          )}
          {opportunities.length > 0 && (
            <section className="pl-group">
              <h3>Matched opportunities <span className="pl-n">{opportunities.length}</span></h3>
              {opportunities.map(m => (
                <div className="pl-row" key={m.id}>
                  <div className="pl-row-main">
                    <span className="pl-funder">{m.opportunity?.title}</span>
                    <div className="pl-meta">
                      <span>{m.opportunity?.agency}</span>
                      {m.fit_score !== null && <span className="pl-score">{m.fit_score}/100 fit</span>}
                      {m.opportunity?.source_url && (
                        <a href={m.opportunity.source_url} target="_blank" rel="noreferrer noopener">Listing ↗</a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      );
    }

    if (active === 'filed') {
      const { grants, incomplete } = data.filed;
      if (!grants.length) return <Empty>No applications are with a funder right now.</Empty>;
      return (
        <section className="pl-group">
          {incomplete > 0 && (
            <p className="pl-note">
              {incomplete} filed application{incomplete > 1 ? 's have' : ' has'} unfinished paperwork.
            </p>
          )}
          {grants.map(g => (
            <GrantRow
              key={g.id}
              grant={g}
              trailing={g.submitted_at ? <span>Sent {fmtDate(g.submitted_at)}</span> : <span className="pl-status">{g.status}</span>}
            />
          ))}
        </section>
      );
    }

    if (active === 'past') {
      const { missed, decided } = data.past;
      if (!missed.length && !decided.length) return <Empty>Nothing has closed out yet.</Empty>;
      return (
        <>
          {missed.length > 0 && (
            <section className="pl-group">
              <h3>Deadline passed without filing <span className="pl-n">{missed.length}</span></h3>
              <p className="pl-note">Worth a look — these were started but never sent.</p>
              {missed.map(g => <GrantRow key={g.id} grant={g} />)}
            </section>
          )}
          {decided.length > 0 && (
            <section className="pl-group">
              <h3>Decided <span className="pl-n">{decided.length}</span></h3>
              {decided.map(g => (
                <GrantRow
                  key={g.id}
                  grant={g}
                  showDocs={false}
                  trailing={
                    <span className={g.status === 'funded' ? 'pl-funded' : 'pl-rejected'}>
                      {g.status === 'funded' ? 'Funded' : 'Not funded'}
                      {g.outcome_recorded_at ? ` · ${fmtDate(g.outcome_recorded_at)}` : ''}
                    </span>
                  }
                />
              ))}
            </section>
          )}
        </>
      );
    }

    // reopened
    const { candidates, eligible } = data.reopened;
    if (!candidates.length) return <Empty>No rejected grants are up for another cycle yet.</Empty>;
    return (
      <section className="pl-group">
        {eligible > 0 && <p className="pl-note">{eligible} ready to reapply now.</p>}
        {candidates.map(c => (
          <div className="pl-row" key={c.id}>
            <div className="pl-row-main">
              <span className="pl-funder">{c.funder_name || c.originalGrant?.funder_name}</span>
              <div className="pl-meta">
                {c.next_cycle_date && <span>Next cycle {fmtDate(c.next_cycle_date)}</span>}
                <span className={c.status === 'eligible' ? 'pl-eligible' : ''}>{c.status}</span>
                {c.auto_reapply && <span className="pl-auto">auto-reapply on</span>}
              </div>
            </div>
          </div>
        ))}
      </section>
    );
  };

  return (
    <section className="pipeline-section">
      <div className="section-header">
        <div>
          <h2>Pipeline</h2>
          <p className="pl-sub">{TABS.find(t => t.key === active)?.blurb}</p>
        </div>
        <button className="btn-outline" onClick={fetchPipeline} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="pl-error">{error}<button onClick={() => setError(null)}>✕</button></div>
      )}

      <nav className="pl-tabs" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            className={`pl-tab ${active === t.key ? 'active' : ''}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
            {count(t.key) !== null && <span className="pl-badge">{count(t.key)}</span>}
          </button>
        ))}
      </nav>

      <div className="pl-body">
        {loading && !data ? <Empty>Loading…</Empty> : renderTab()}
      </div>

      {openDocs && (
        <ApplicationDocuments
          grant={openDocs}
          onClose={() => setOpenDocs(null)}
          onChanged={() => { fetchPipeline(); if (onChanged) onChanged(); }}
        />
      )}
    </section>
  );
}
