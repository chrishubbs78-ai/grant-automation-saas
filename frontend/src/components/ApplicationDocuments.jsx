import { API_BASE } from '../config';
import { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/pipeline.css';

/**
 * The document checklist for one application: what this funder asks for,
 * what you have, and what is still missing.
 */
export default function ApplicationDocuments({ grant, onClose, onChanged }) {
  const [docs, setDocs] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const fileRefs = useRef({});

  const token = () => localStorage.getItem('token');
  const base = `${API_BASE}/api/grants/${grant.id}/documents`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(base, { headers: { Authorization: `Bearer ${token()}` } });
      const json = await res.json();
      if (json.success) {
        setDocs(json.data.documents);
        setProgress(json.data.progress);
        setError(null);
      } else setError(json.error);
    } catch {
      setError('Could not load the checklist');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { load(); }, [load]);

  const done = () => { load(); if (onChanged) onChanged(); };

  const seed = async () => {
    setBusy('seed');
    try {
      const res = await fetch(`${base}/seed`, {
        method: 'POST', headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) done(); else setError(json.error);
    } catch { setError('Could not add the standard checklist'); }
    finally { setBusy(null); }
  };

  const addItem = async (e) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setBusy('add');
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ label: newLabel.trim() })
      });
      const json = await res.json();
      if (json.success) { setNewLabel(''); done(); } else setError(json.error);
    } catch { setError('Could not add that item'); }
    finally { setBusy(null); }
  };

  const upload = (doc) => {
    const file = fileRefs.current[doc.id]?.files?.[0];
    if (!file) return;
    const MAX_MB = 15;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`"${file.name}" is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${MAX_MB} MB`);
      return;
    }

    setBusy(doc.id);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await fetch(`${base}/${doc.id}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
          body: JSON.stringify({
            file_name: file.name,
            mime_type: file.type,
            file_data: ev.target.result.split(',')[1]
          })
        });
        const json = await res.json();
        if (json.success) done(); else setError(json.error);
      } catch { setError('Upload failed'); }
      finally { setBusy(null); }
    };
    reader.onerror = () => { setError('Could not read that file'); setBusy(null); };
    reader.readAsDataURL(file);
  };

  const download = async (doc) => {
    try {
      const res = await fetch(`${base}/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || 'document';
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Download failed'); }
  };

  const setStatus = async (doc, status) => {
    setBusy(doc.id);
    try {
      const res = await fetch(`${base}/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) done(); else setError(json.error);
    } catch { setError('Could not update that item'); }
    finally { setBusy(null); }
  };

  const remove = async (doc) => {
    if (!confirm(`Remove "${doc.label}" from this checklist?`)) return;
    setBusy(doc.id);
    try {
      const res = await fetch(`${base}/${doc.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) done(); else setError(json.error);
    } catch { setError('Could not remove that item'); }
    finally { setBusy(null); }
  };

  return (
    <div className="doc-overlay" onClick={onClose}>
      <div className="doc-panel" onClick={e => e.stopPropagation()}>
        <div className="doc-head">
          <div>
            <h2>Required documents</h2>
            <p>{grant.funder_name || 'This application'}</p>
          </div>
          <button className="doc-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {progress && progress.required > 0 && (
          <div className={`doc-progress ${progress.complete ? 'ok' : ''}`}>
            <strong>{progress.attached} of {progress.required}</strong> required documents attached
            {!progress.complete && progress.missing.length > 0 && (
              <span> — still needed: {progress.missing.join(', ')}</span>
            )}
          </div>
        )}

        {error && <div className="doc-error">{error}<button onClick={() => setError(null)}>✕</button></div>}

        {loading ? (
          <p className="doc-empty">Loading…</p>
        ) : docs.length === 0 ? (
          <div className="doc-empty-state">
            <p>No checklist yet for this application.</p>
            <button className="btn-primary" onClick={seed} disabled={busy === 'seed'}>
              {busy === 'seed' ? 'Adding…' : 'Add the standard checklist'}
            </button>
            <p className="doc-hint">
              Adds the items most funders ask for — determination letter, 990, audit,
              budgets, board list. Edit or remove anything that does not apply.
            </p>
          </div>
        ) : (
          <ul className="doc-list">
            {docs.map(doc => {
              const attached = doc.status === 'attached';
              const na = doc.status === 'not_applicable';
              return (
                <li key={doc.id} className={`doc-item ${attached ? 'attached' : ''} ${na ? 'na' : ''}`}>
                  <div className="doc-item-main">
                    <div className="doc-item-head">
                      <span className="doc-label">{doc.label}</span>
                      {doc.required
                        ? <span className="doc-req">required</span>
                        : <span className="doc-opt">optional</span>}
                      {na && <span className="doc-na">not applicable</span>}
                    </div>
                    {doc.description && <p className="doc-desc">{doc.description}</p>}
                    {attached && (
                      <p className="doc-file">
                        {doc.file_name || (doc.vaultDocument && `From vault: ${doc.vaultDocument.file_name}`)}
                        {doc.file_size_bytes ? ` · ${(doc.file_size_bytes / 1024).toFixed(0)} KB` : ''}
                      </p>
                    )}
                  </div>

                  <div className="doc-actions">
                    {attached ? (
                      <>
                        <button className="btn-quiet-sm" onClick={() => download(doc)}>Download</button>
                        <button className="btn-quiet-sm" onClick={() => setStatus(doc, 'needed')} disabled={busy === doc.id}>
                          Replace
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="file"
                          ref={el => { fileRefs.current[doc.id] = el; }}
                          onChange={() => upload(doc)}
                          className="doc-file-input"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
                          aria-label={`Upload ${doc.label}`}
                        />
                        {!na && (
                          <button className="btn-quiet-sm" onClick={() => setStatus(doc, 'not_applicable')} disabled={busy === doc.id}>
                            N/A
                          </button>
                        )}
                      </>
                    )}
                    <button className="btn-quiet-sm danger" onClick={() => remove(doc)} disabled={busy === doc.id}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form className="doc-add" onSubmit={addItem}>
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Add another required item…"
            aria-label="New document requirement"
          />
          <button className="btn-quiet-sm" type="submit" disabled={!newLabel.trim() || busy === 'add'}>
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
