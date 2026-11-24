import { useEffect, useState, useCallback } from 'react';
import { api, money, fmtDate } from '../services/api';
import '../styles/funding.css';

const NUMBER_FIELDS = [
  { key: 'amount_needed', label: 'Total loan amount needed ($)' },
  { key: 'owner_equity', label: 'Your own cash going in ($)', help: 'Lenders usually expect about 10% of the project from a startup owner.' },
  { key: 'owner_credit_score', label: 'Your personal credit score' },
  { key: 'months_in_business', label: 'Months in business (0 if not open yet)' },
  { key: 'startup_costs', label: 'Total startup costs ($)' },
  { key: 'monthly_revenue_projection', label: 'Expected monthly sales once established ($)' },
  { key: 'industry_experience_years', label: 'Years of retail, management or youth-program experience' }
];

const FLAGS = [
  { key: 'has_projections', label: 'I have 3-year financial projections' },
  { key: 'has_tax_returns', label: 'I have my last 3 years of personal tax returns' },
  { key: 'has_personal_financial_statement', label: 'I have filled out SBA Form 413 (personal financial statement)' },
  { key: 'buying_property', label: 'I plan to buy a building (not lease)' }
];

const STATUS_LABELS = {
  researching: 'Researching', preparing: 'Preparing', submitted: 'Submitted', in_underwriting: 'In underwriting',
  approved: 'Approved', declined: 'Declined', funded: 'Funded', withdrawn: 'Withdrawn'
};

export default function LoanCenter() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [funds, setFunds] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [openPkg, setOpenPkg] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/loans/overview');
      setData(d);
      setForm(d.profile || {});
      setFunds((d.profile.use_of_funds || []).map(u => (u.amount ? `${u.item}: ${u.amount}` : u.item)).join('\n'));
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (label, fn, okText) => {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      await load();
      if (okText) setMsg({ kind: 'ok', text: okText });
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="fx-page">{msg ? <div className={`fx-msg ${msg.kind}`}>{msg.text}</div> : 'Loading loans…'}</div>;

  const saveProfile = () => act('profile', () => {
    const use_of_funds = funds.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const m = /^(.*?)[:\-–]\s*\$?([\d,]+)\s*$/.exec(l);
      return m ? { item: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) } : { item: l, amount: null };
    });
    const body = { use_of_funds };
    for (const f of NUMBER_FIELDS) body[f.key] = form[f.key] === undefined ? undefined : form[f.key];
    for (const f of FLAGS) body[f.key] = Boolean(form[f.key]);
    body.collateral = form.collateral || '';
    return api('/api/loans/profile', { method: 'PUT', body });
  }, 'Loan profile saved. Readiness and program fit are updated.');

  const r = data.readiness;

  return (
    <div className="fx-page">
      <div className="fx-card">
        <h2>Small-business loans</h2>
        <p className="fx-sub">Loans are borrowed by the store and you as owner; grants cover the youth program. Fill in what lenders ask for, see which programs fit, and have a lender-ready packet written from your business plan. Rates and limits change, so confirm on each program's official page before applying.</p>
        <div className="fx-row">
          <div className="fx-meter" style={{ flex: 1, minWidth: 160 }}><span style={{ width: `${r.score}%` }} /></div>
          <strong>Loan readiness {r.score}/100</strong>
          {r.equity_pct_of_project !== null && <span className="fx-muted">Your cash is {r.equity_pct_of_project}% of the project</span>}
        </div>
        <ul className="fx-list" style={{ marginTop: 10 }}>
          {r.items.map(i => (
            <li key={i.key}>{i.done ? '✓' : '○'} <strong>{i.label}</strong>{i.fix && <div className="fx-muted">{i.fix}</div>}</li>
          ))}
        </ul>
      </div>

      {msg && <div className={`fx-msg ${msg.kind}`}>{msg.text}</div>}

      <div className="fx-card">
        <h2>What lenders will ask</h2>
        <div className="fx-grid">
          {NUMBER_FIELDS.map(f => (
            <div className="fx-field" key={f.key}>
              <label htmlFor={`ln-${f.key}`}>{f.label}</label>
              <input id={`ln-${f.key}`} type="number" min="0" value={form[f.key] ?? ''} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value === '' ? null : e.target.value }))} />
              {f.help && <span className="fx-help">{f.help}</span>}
            </div>
          ))}
        </div>
        <div className="fx-field">
          <label htmlFor="ln-funds">What the loan pays for (one per line, e.g. "Opening inventory: 25000")</label>
          <textarea id="ln-funds" value={funds} onChange={e => setFunds(e.target.value)} />
        </div>
        <div className="fx-field">
          <label htmlFor="ln-collateral">Collateral you could offer (vehicle, home equity, equipment)</label>
          <input id="ln-collateral" value={form.collateral || ''} onChange={e => setForm(x => ({ ...x, collateral: e.target.value }))} />
        </div>
        {FLAGS.map(f => (
          <label className="fx-check" key={f.key}>
            <input type="checkbox" checked={Boolean(form[f.key])} onChange={e => setForm(x => ({ ...x, [f.key]: e.target.checked }))} />
            {f.label}
          </label>
        ))}
        <button className="fx-btn primary" disabled={!!busy} onClick={saveProfile}>{busy === 'profile' ? 'Saving…' : 'Save loan profile'}</button>
      </div>

      <div className="fx-card">
        <h2>Programs that fit</h2>
        <p className="fx-sub">Ranked for your amount, credit and time in business.</p>
        <div className="fx-grid">
          {data.programs.map(p => (
            <div className="ln-program" key={p.key}>
              <div className="fx-between">
                <h4>{p.name}</h4>
                <span className={`fx-pill ${p.fit_score >= 75 ? 'good' : p.fit_score >= 50 ? 'neutral' : 'high'}`}>{p.fit_score}</span>
              </div>
              <span className="fx-muted">{money(p.amount_min)}–{money(p.amount_max)} · {p.typical_term}</span>
              <span style={{ fontSize: 13 }}>{p.good_for}</span>
              {p.reasons.length > 0 && <ul>{p.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              {p.cautions.length > 0 && <ul style={{ color: '#92400e' }}>{p.cautions.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              <div className="fx-row" style={{ marginTop: 'auto' }}>
                <a className="fx-muted" href={p.official_url} target="_blank" rel="noreferrer">Official page</a>
                <button className="fx-btn small" disabled={!!busy} onClick={() => act(`start-${p.key}`, () => api('/api/loans/applications', { method: 'POST', body: { program_key: p.key } }), `Tracking ${p.name}.`)}>Track this</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fx-card">
        <h2>Your loan applications</h2>
        {data.applications.length === 0
          ? <p className="fx-sub">None yet. Pick a program above to start tracking it.</p>
          : (
            <div className="ln-scroll">
              <table className="ln-table">
                <thead><tr><th>Lender</th><th>Amount</th><th>Status</th><th>Next step</th><th></th></tr></thead>
                <tbody>
                  {data.applications.map(l => (
                    <tr key={l.id}>
                      <td>{l.lender_name}{l.google && l.google.drive_link && <div><a className="fx-muted" href={l.google.drive_link} target="_blank" rel="noreferrer">Packet in Drive</a></div>}</td>
                      <td>{money(l.amount_requested)}</td>
                      <td>
                        <select value={l.status} onChange={e => act(`status-${l.id}`, () => api(`/api/loans/applications/${l.id}`, { method: 'PATCH', body: { status: e.target.value } }))}>
                          {data.statuses.map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>{l.next_step || '—'}</div>
                        <input type="date" value={l.next_step_date ? String(l.next_step_date).slice(0, 10) : ''} onChange={e => act(`date-${l.id}`, () => api(`/api/loans/applications/${l.id}`, { method: 'PATCH', body: { next_step_date: e.target.value || null } }))} />
                        <div className="fx-muted">{l.next_step_date ? `Due ${fmtDate(l.next_step_date)}` : 'Add a date to get reminders'}</div>
                      </td>
                      <td>
                        <div className="fx-row">
                          <button className="fx-btn small primary" disabled={!!busy} onClick={() => act(`pkg-${l.id}`, () => api(`/api/loans/applications/${l.id}/package`, { method: 'POST' }), 'Loan packet written.')}>
                            {busy === `pkg-${l.id}` ? 'Writing…' : (l.loan_package && l.loan_package.cover_letter ? 'Rewrite packet' : 'Write loan packet')}
                          </button>
                          {l.loan_package && l.loan_package.cover_letter && (
                            <button className="fx-btn small" onClick={() => setOpenPkg(openPkg === l.id ? null : l.id)}>{openPkg === l.id ? 'Hide' : 'View'}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {openPkg && (() => {
          const l = data.applications.find(x => x.id === openPkg);
          const p = (l && l.loan_package) || {};
          const block = (title, text) => text ? <><h3>{title}</h3><div className="bp-written">{text}</div></> : null;
          return (
            <div style={{ marginTop: 16 }}>
              {block('Cover letter', p.cover_letter)}
              {block('Loan request', p.loan_request_summary)}
              {Array.isArray(p.use_of_funds) && p.use_of_funds.length > 0 && (
                <><h3>Use of funds</h3><ul className="fx-list">{p.use_of_funds.map((u, i) => <li key={i}>{u.item}{u.amount ? `: ${money(u.amount)}` : ''}</li>)}</ul></>
              )}
              {block('Repayment ability', p.repayment_ability)}
              {block('Owner contribution and collateral', p.owner_contribution_and_collateral)}
              {block('Management', p.management_summary)}
              {block('Risks and mitigations', p.risks_and_mitigations)}
              {block('Community impact', p.community_impact)}
              {(p.still_needed || []).length > 0 && <><h3>Still needed</h3><ul className="fx-list">{p.still_needed.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
