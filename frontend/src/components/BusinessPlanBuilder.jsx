import { useEffect, useState, useCallback } from 'react';
import { api, download } from '../services/api';
import '../styles/funding.css';

/**
 * Guided business plan: answer questions section by section, pull in market
 * research, get a funder-and-lender review, and have each section written in
 * a professional voice. Written sections feed every grant draft and loan packet.
 */
export default function BusinessPlanBuilder() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState('youth_program');
  const [draftAnswers, setDraftAnswers] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api('/api/business-plan');
      setData(d);
      setDraftAnswers(d.answers || {});
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="fx-page">{msg ? <div className={`fx-msg ${msg.kind}`}>{msg.text}</div> : 'Loading your business plan…'}</div>;

  const section = data.sections.find(s => s.key === active) || data.sections[0];
  const progress = data.progress.sections.find(s => s.key === section.key);
  const research = data.research[section.key];
  const notes = data.writing_notes[section.key];
  const written = data.written[section.key];
  const dirty = section.questions.some(q => (draftAnswers[q.id] || '') !== (data.answers[q.id] || ''));

  const run = async (label, fn, okText) => {
    setBusy(label);
    setMsg(null);
    try {
      const d = await fn();
      if (d) { setData(d); setDraftAnswers(d.answers || {}); }
      if (okText) setMsg({ kind: 'ok', text: okText });
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const saveAnswers = () => {
    const changed = {};
    for (const q of section.questions) {
      const v = draftAnswers[q.id] || '';
      if (v !== (data.answers[q.id] || '')) changed[q.id] = v;
    }
    return api('/api/business-plan/answers', { method: 'PUT', body: { answers: changed } });
  };

  const writeSection = () => run('write', async () => {
    if (dirty) await saveAnswers();
    return api(`/api/business-plan/sections/${section.key}/write`, { method: 'POST' });
  }, `${section.title} written. Review it below and edit anything that is not quite right.`);

  const review = data.last_review;

  return (
    <div className="fx-page">
      <div className="fx-card">
        <div className="fx-between">
          <div>
            <h2>Business plan builder</h2>
            <p className="fx-sub">Answer in your own words; short answers are fine. Claude researches your market, points out what funders and lenders will ask, and writes each section professionally. Every grant draft and loan packet uses what you write here.</p>
          </div>
          <div className="fx-row">
            <button className="fx-btn" disabled={!!busy} onClick={() => run('review', () => api('/api/business-plan/review', { method: 'POST' }), 'Review updated.')}>
              {busy === 'review' ? 'Reviewing…' : 'Review my plan'}
            </button>
            <button className="fx-btn" disabled={!!busy} onClick={() => run('export', async () => { await download('/api/business-plan/export.docx', 'Business_Plan.docx'); return null; })}>
              Download .docx
            </button>
            <button className="fx-btn" disabled={!!busy} onClick={() => run('drive', async () => { const f = await api('/api/business-plan/drive', { method: 'POST' }); window.open(f.link, '_blank', 'noopener'); return null; }, 'Saved to Google Drive as an editable Google Doc.')}>
              Save to Google Drive
            </button>
          </div>
        </div>
        <div className="fx-row" style={{ marginTop: 6 }}>
          <div className="fx-meter" style={{ flex: 1, minWidth: 160 }}><span style={{ width: `${data.progress.percent}%` }} /></div>
          <span className="fx-muted">{data.progress.percent}% of required questions answered</span>
          {data.drive_link && <a className="fx-muted" href={data.drive_link} target="_blank" rel="noreferrer">Open in Drive</a>}
        </div>
      </div>

      {msg && <div className={`fx-msg ${msg.kind}`}>{msg.text}</div>}

      {(data.quick_recommendations.length > 0 || review) && (
        <div className="fx-card">
          <h2>Recommendations</h2>
          {review && <p className="fx-sub">{review.summary} <strong>Readiness: {review.readiness_score}/100.</strong></p>}
          <ul className="fx-list">
            {[...(review ? review.recommendations || [] : []), ...data.quick_recommendations]
              .filter((r, i, all) => all.findIndex(x => x.message === r.message) === i)
              .slice(0, 10)
              .map((r, i) => (
                <li key={i}><span className={`fx-pill ${r.priority}`}>{r.priority}</span> <strong>{r.area}:</strong> {r.message}</li>
              ))}
          </ul>
          {review && review.follow_up_questions && review.follow_up_questions.length > 0 && (
            <>
              <h3>Questions to answer next</h3>
              <ul className="fx-list">
                {review.follow_up_questions.slice(0, 8).map((q, i) => (
                  <li key={i}>
                    <button className="fx-btn small" onClick={() => setActive(q.section)}>Go</button>{' '}
                    {q.question}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="bp-layout">
        <nav className="fx-card bp-nav">
          {data.sections.map(s => {
            const p = data.progress.sections.find(x => x.key === s.key);
            const done = Boolean(data.written[s.key]);
            return (
              <button key={s.key} className={s.key === active ? 'active' : ''} onClick={() => { setActive(s.key); setEditing(false); setMsg(null); }}>
                <span>{s.title}</span>
                <span className="fx-muted">{done ? '✓' : `${p.answered}/${p.total}`}</span>
              </button>
            );
          })}
        </nav>

        <div>
          <div className="fx-card">
            <h2>{section.title}</h2>
            <p className="fx-sub">{section.why}</p>
            {section.questions.map(q => (
              <div className="fx-field" key={q.id}>
                <label htmlFor={q.id}>{q.prompt}{q.required ? '' : ' (optional)'}</label>
                <textarea
                  id={q.id}
                  value={draftAnswers[q.id] || ''}
                  onChange={e => setDraftAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                />
              </div>
            ))}
            <div className="fx-row">
              <button className="fx-btn" disabled={!dirty || !!busy} onClick={() => run('save', saveAnswers, 'Answers saved.')}>
                {busy === 'save' ? 'Saving…' : 'Save answers'}
              </button>
              {section.research && (
                <button className="fx-btn" disabled={!!busy} onClick={() => run('research', async () => {
                  if (dirty) await saveAnswers();
                  return api(`/api/business-plan/sections/${section.key}/research`, { method: 'POST' });
                }, 'Research added below.')}>
                  {busy === 'research' ? 'Researching (about a minute)…' : 'Research this section'}
                </button>
              )}
              <button className="fx-btn primary" disabled={!!busy} onClick={writeSection}>
                {busy === 'write' ? 'Writing…' : written ? 'Rewrite section' : 'Write this section'}
              </button>
              {progress && progress.missing_required.length > 0 && (
                <span className="fx-muted">{progress.missing_required.length} required answer(s) still empty; Claude will note what is missing.</span>
              )}
            </div>
          </div>

          {research && (
            <div className="fx-card">
              <h2>Research</h2>
              <ul className="fx-list">
                {(research.findings || []).map((f, i) => (
                  <li key={i}>
                    {f.fact} {f.url ? <a href={f.url} target="_blank" rel="noreferrer">({f.source || 'source'})</a> : f.source ? <span className="fx-muted">({f.source})</span> : null}
                    {f.use_in_plan && <div className="fx-muted">{f.use_in_plan}</div>}
                  </li>
                ))}
              </ul>
              {(research.suggested_answers || []).length > 0 && (
                <>
                  <h3>Suggested answers</h3>
                  <ul className="fx-list">
                    {research.suggested_answers.map((s, i) => (
                      <li key={i}>
                        {s.suggestion}{' '}
                        <button className="fx-btn small" onClick={() => setDraftAnswers(a => ({ ...a, [s.question_id]: a[s.question_id] ? `${a[s.question_id]}\n${s.suggestion}` : s.suggestion }))}>Use</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {written && (
            <div className="fx-card">
              <div className="fx-between">
                <h2>Written section</h2>
                {!editing
                  ? <button className="fx-btn small" onClick={() => { setEditText(written); setEditing(true); }}>Edit</button>
                  : (
                    <div className="fx-row">
                      <button className="fx-btn small" onClick={() => setEditing(false)}>Cancel</button>
                      <button className="fx-btn small primary" disabled={!!busy} onClick={() => run('edit', async () => {
                        const d = await api(`/api/business-plan/sections/${section.key}`, { method: 'PUT', body: { text: editText } });
                        setEditing(false);
                        return d;
                      }, 'Your edits are saved.')}>Save</button>
                    </div>
                  )}
              </div>
              {editing
                ? <textarea className="bp-written-edit" value={editText} onChange={e => setEditText(e.target.value)} />
                : <div className="bp-written">{written}</div>}
              {notes && (notes.still_needed || []).length > 0 && (
                <>
                  <h3>Would make this stronger</h3>
                  <ul className="fx-list">{notes.still_needed.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </>
              )}
              {notes && (notes.assumptions || []).length > 0 && (
                <>
                  <h3>Please confirm</h3>
                  <ul className="fx-list">{notes.assumptions.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
