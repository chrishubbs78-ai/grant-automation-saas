import { useEffect, useState, useCallback } from 'react';
import { api, download, fmtDate, money } from '../services/api';
import '../styles/funding.css';

const TOGGLES = [
  { key: 'enabled', label: 'Run automatically every day', help: 'Needs AUTOMATION_ENABLED=true on the server. You can always press "Run now".' },
  { key: 'auto_discover', label: 'Search for new grants each run' },
  { key: 'auto_draft', label: 'Write tailored drafts for new applications' },
  { key: 'auto_reapply', label: 'Reapply with an improved draft when a rejected grant reopens' },
  { key: 'drive_sync', label: 'Save every proposal and loan packet to Google Drive as an editable Doc' },
  { key: 'calendar_sync', label: 'Put every deadline in Google Calendar with reminders' },
  { key: 'gmail_drafts', label: 'Prepare email submissions in Gmail drafts' },
  { key: 'auto_send_email_submissions', label: 'Send email submissions automatically once nothing is missing', help: 'Off means you review each one in Gmail and press Send.' },
  { key: 'inbox_scan', label: 'Watch my inbox for funder replies' },
  { key: 'digest_email', label: 'Email me a summary after each run' }
];

const LANE_LABEL = { business: 'Store applies', sponsored_program: 'Youth program via sponsor', organization: 'Organization applies' };

export default function AutomationCenter({ orgProfile, onProfileChanged }) {
  const [auto, setAuto] = useState(null);
  const [google, setGoogle] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [grants, setGrants] = useState([]);
  const [structure, setStructure] = useState({
    entityType: orgProfile.entityType || 'nonprofit',
    fiscalSponsor: orgProfile.fiscalSponsor || {}
  });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('google');
    if (p === 'connected') return { kind: 'ok', text: 'Google is connected. Gmail, Calendar and Drive will now stay in sync.' };
    if (p === 'denied') return { kind: 'err', text: 'Google access was not granted.' };
    if (p === 'error') return { kind: 'err', text: 'Connecting Google failed. Please try again.' };
    return null;
  });

  const load = useCallback(async () => {
    try {
      const [a, g, u, gr] = await Promise.all([
        api('/api/automation'),
        api('/api/google/status'),
        api('/api/calendar/upcoming'),
        api('/api/grants?status=draft&limit=50')
      ]);
      setAuto(a); setGoogle(g); setUpcoming(u); setGrants(gr || []);
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Clean the ?google=... marker off the URL once its message has been read.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('google')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const act = async (label, fn, okText) => {
    setBusy(label);
    setMsg(null);
    try {
      const out = await fn();
      await load();
      if (okText) setMsg({ kind: 'ok', text: typeof okText === 'function' ? okText(out) : okText });
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (!auto || !google) return <div className="fx-page">{msg ? <div className={`fx-msg ${msg.kind}`}>{msg.text}</div> : 'Loading…'}</div>;

  const s = auto.settings;
  const setSetting = (key, value) => act(`set-${key}`, () => api('/api/automation/settings', { method: 'PUT', body: { [key]: value } }));
  const sponsor = structure.fiscalSponsor || {};
  const setSponsor = (k, v) => setStructure(x => ({ ...x, fiscalSponsor: { ...(x.fiscalSponsor || {}), [k]: v } }));
  const lastRun = auto.runs[0];

  return (
    <div className="fx-page">
      {msg && <div className={`fx-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="fx-card">
        <div className="fx-between">
          <div>
            <h2>Automation</h2>
            <p className="fx-sub">One run searches for grants, starts strong matches, writes tailored drafts, reapplies when cycles reopen, syncs Gmail, Calendar and Drive, checks your inbox for replies, and tells you what only you can do.</p>
          </div>
          <button className="fx-btn primary" disabled={!!busy} onClick={() => act('run', () => api('/api/automation/run', { method: 'POST' }), r => `Run ${r.status}. ${r.actions.filter(a => a.outcome === 'ok').length} step(s) did something.`)}>
            {busy === 'run' ? 'Running (this can take a few minutes)…' : 'Run now'}
          </button>
        </div>

        <h3>Needs you</h3>
        {auto.needs_you.length === 0
          ? <p className="fx-sub">Nothing right now.</p>
          : <ul className="fx-list">{auto.needs_you.map((n, i) => <li key={i}>{n.message}</li>)}</ul>}

        {lastRun && (
          <>
            <h3>Last run · {fmtDate(lastRun.started_at)} · {lastRun.status}</h3>
            <ul className="fx-list">
              {lastRun.actions.map((a, i) => (
                <li key={i}><span className={`fx-pill ${a.outcome === 'ok' ? 'good' : 'high'}`}>{a.step.replace(/_/g, ' ')}</span> {a.detail}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="fx-card">
        <h2>Google account</h2>
        {!google.server_configured && (
          <div className="fx-msg info">Google is not set up on the server yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to the backend (see backend/.env.example), then connect here.</div>
        )}
        {google.connected ? (
          <div className="fx-between">
            <p className="fx-sub">Connected as <strong>{google.google_email || 'your Google account'}</strong>. The tool can create and send Gmail drafts, read funder replies, add Calendar events, and manage only the files it creates in Drive.{google.last_error && <><br /><span style={{ color: '#991b1b' }}>{google.last_error}</span></>}</p>
            <div className="fx-row">
              <button className="fx-btn" disabled={!!busy} onClick={() => act('cal', () => api('/api/google/calendar/sync', { method: 'POST' }), r => `Calendar synced: ${r.synced} date(s), ${r.created} new.`)}>Sync calendar now</button>
              <button className="fx-btn" disabled={!!busy} onClick={() => act('disc', () => api('/api/google', { method: 'DELETE' }), 'Google disconnected.')}>Disconnect</button>
            </div>
          </div>
        ) : (
          <button className="fx-btn primary" disabled={!google.server_configured || !!busy} onClick={() => act('connect', async () => { const r = await api('/api/google/auth-url'); window.location.href = r.url; })}>
            Connect Google (Gmail, Calendar, Drive)
          </button>
        )}
      </div>

      <div className="fx-card">
        <h2>Who applies</h2>
        <p className="fx-sub">Most youth and foundation grants only fund nonprofits. With a fiscal sponsor, the youth program applies through the sponsor while the store applies for small-business grants and loans. The tool picks the right one for each opportunity.</p>
        <div className="fx-grid">
          <div className="fx-field">
            <label htmlFor="entityType">Structure</label>
            <select id="entityType" value={structure.entityType} onChange={e => setStructure(x => ({ ...x, entityType: e.target.value }))}>
              <option value="hybrid">Store (for-profit) + fiscally sponsored youth program</option>
              <option value="for_profit_small_business">Store only (for-profit)</option>
              <option value="nonprofit">Nonprofit</option>
            </select>
          </div>
          {[['name', 'Fiscal sponsor name'], ['ein', 'Sponsor EIN'], ['program_name', 'Youth program name'], ['contact_name', 'Sponsor contact'], ['contact_email', 'Sponsor contact email'], ['fee_pct', 'Sponsor fee (%)']].map(([k, label]) => (
            <div className="fx-field" key={k}>
              <label htmlFor={`sp-${k}`}>{label}</label>
              <input id={`sp-${k}`} value={sponsor[k] || ''} onChange={e => setSponsor(k, e.target.value)} />
            </div>
          ))}
          <div className="fx-field">
            <label htmlFor="sp-status">Sponsor agreement</label>
            <select id="sp-status" value={sponsor.agreement_status || ''} onChange={e => setSponsor('agreement_status', e.target.value)}>
              <option value="">Not started</option>
              <option value="talking">In conversation</option>
              <option value="signed">Signed</option>
            </select>
          </div>
        </div>
        <button className="fx-btn primary" disabled={!!busy} onClick={() => act('structure', async () => {
          const updated = await api('/api/org', { method: 'PUT', body: structure });
          if (onProfileChanged) onProfileChanged(updated);
        }, 'Saved. New matches will be routed to the right applicant.')}>Save</button>
      </div>

      <div className="fx-card">
        <h2>Submissions</h2>
        <p className="fx-sub">For each application, say how the funder takes it. Email submissions go out from your Gmail with the proposal attached. Portal submissions need you to sign in to the funder's site; the proposal will be ready in Drive.</p>
        {grants.length === 0 ? <p className="fx-sub">No open applications yet.</p> : (
          <div className="ln-scroll">
            <table className="ln-table">
              <thead><tr><th>Funder</th><th>Due</th><th>Applies as</th><th>How to submit</th><th></th></tr></thead>
              <tbody>
                {grants.map(g => (
                  <SubmissionRow key={g.id} grant={g} busy={busy} act={act} googleConnected={google.connected} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fx-card">
        <div className="fx-between">
          <div>
            <h2>Upcoming dates</h2>
            <p className="fx-sub">Grant deadlines, reopening cycles and loan next steps.</p>
          </div>
          <div className="fx-row">
            <button className="fx-btn" onClick={() => act('ics', () => download('/api/calendar/export.ics', 'grant-deadlines.ics'))}>Download .ics</button>
            <button className="fx-btn" onClick={() => act('feed', async () => { const r = await api('/api/calendar/feed-url'); await navigator.clipboard.writeText(r.url); }, 'Private calendar link copied. Add it in any calendar app with "Subscribe from URL".')}>Copy subscribe link</button>
          </div>
        </div>
        {upcoming.length === 0 ? <p className="fx-sub">Nothing dated in the next six months.</p> : (
          <ul className="fx-list">
            {upcoming.map(u => (
              <li key={u.key}>
                <span className={`fx-pill ${u.days_left <= 7 ? 'high' : u.days_left <= 21 ? 'medium' : 'neutral'}`}>{u.days_left}d</span>{' '}
                <strong>{u.title}</strong> · {fmtDate(u.date)}
                {u.detail && <div className="fx-muted">{u.detail}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="fx-card">
        <h2>What runs without asking</h2>
        {TOGGLES.map(t => (
          <label className="fx-check" key={t.key}>
            <input type="checkbox" checked={Boolean(s[t.key])} disabled={!!busy} onChange={e => setSetting(t.key, e.target.checked)} />
            <span>{t.label}{t.help && <div className="fx-muted">{t.help}</div>}</span>
          </label>
        ))}
        <div className="fx-grid">
          <div className="fx-field">
            <label htmlFor="minscore">Start an application automatically when the match score is at least</label>
            <input id="minscore" type="number" min="50" max="100" defaultValue={s.auto_start_min_score} onBlur={e => setSetting('auto_start_min_score', Number(e.target.value))} />
          </div>
          <div className="fx-field">
            <label htmlFor="maxnew">New applications per run (0 to only suggest)</label>
            <input id="maxnew" type="number" min="0" max="10" defaultValue={s.max_new_applications_per_run} onBlur={e => setSetting('max_new_applications_per_run', Number(e.target.value))} />
          </div>
          <div className="fx-field">
            <label htmlFor="remind">Reminder days before each deadline</label>
            <input id="remind" defaultValue={(s.reminder_days || []).join(', ')} onBlur={e => setSetting('reminder_days', e.target.value.split(',').map(x => Number(x.trim())).filter(Boolean))} />
          </div>
        </div>
        {!auto.scheduled_on_server && s.enabled && (
          <div className="fx-msg info">Daily runs are switched on here, but the server's scheduler is off. Set AUTOMATION_ENABLED=true on the backend for runs to happen without pressing "Run now".</div>
        )}
      </div>
    </div>
  );
}

function SubmissionRow({ grant, busy, act, googleConnected }) {
  const [method, setMethod] = useState(grant.submission_method || '');
  const [email, setEmail] = useState(grant.submission_email || '');
  const g = grant.google || {};
  const save = () => act(`sub-${grant.id}`, () => api(`/api/google/grants/${grant.id}/submission`, { method: 'PUT', body: { submission_method: method || undefined, submission_email: email } }), r => (r.blockers.length ? `Saved. Before sending: ${r.blockers.join('; ')}.` : 'Saved. Ready to send.'));

  return (
    <tr>
      <td>{grant.funder_name}{grant.amount ? <div className="fx-muted">{money(grant.amount)}</div> : null}</td>
      <td>{fmtDate(grant.deadline)}</td>
      <td>{LANE_LABEL[grant.applicant_lane] || 'Organization applies'}</td>
      <td>
        <select value={method} onChange={e => setMethod(e.target.value)}>
          <option value="">Not set</option>
          <option value="email">Email</option>
          <option value="portal">Funder portal</option>
          <option value="mail">Mail</option>
        </select>
        {method === 'email' && <input style={{ marginTop: 6, display: 'block' }} placeholder="grants@funder.org" value={email} onChange={e => setEmail(e.target.value)} />}
        <button className="fx-btn small" style={{ marginTop: 6 }} disabled={!!busy} onClick={save}>Save</button>
      </td>
      <td>
        <div className="fx-row">
          {googleConnected && (
            <button className="fx-btn small" disabled={!!busy} onClick={() => act(`drive-${grant.id}`, () => api(`/api/google/grants/${grant.id}/drive`, { method: 'POST' }), 'Saved to Drive.')}>To Drive</button>
          )}
          {googleConnected && grant.submission_method === 'email' && (
            <>
              <button className="fx-btn small" disabled={!!busy} onClick={() => act(`gd-${grant.id}`, () => api(`/api/google/grants/${grant.id}/gmail-draft`, { method: 'POST' }), 'Submission is in your Gmail drafts.')}>Gmail draft</button>
              <button className="fx-btn small primary" disabled={!!busy} onClick={() => {
                if (window.confirm(`Send this proposal to ${grant.submission_email} now?`)) {
                  act(`send-${grant.id}`, () => api(`/api/google/grants/${grant.id}/send`, { method: 'POST' }), 'Sent. The application is marked submitted.');
                }
              }}>Send</button>
            </>
          )}
          {g.drive_link && <a className="fx-muted" href={g.drive_link} target="_blank" rel="noreferrer">Open Doc</a>}
        </div>
      </td>
    </tr>
  );
}
