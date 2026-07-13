import { API_BASE } from '../config';
import { useState, useEffect, useRef } from 'react';
import '../styles/financials.css';

const API = `${API_BASE}`;

const DOC_TYPES = [
  { value: '990', label: 'IRS Form 990' },
  { value: 'audit', label: 'Independent Audit' },
  { value: 'budget', label: 'Annual Budget' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'irs_letter', label: 'IRS Determination Letter' },
  { value: 'board_list', label: 'Board Member List' },
  { value: 'other', label: 'Other Financial Document' }
];

const DOC_TYPE_LABELS = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]));

export default function FinancialsVault({ onClose }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    document_type: '990',
    fiscal_year: new Date().getFullYear() - 1,
    description: ''
  });
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef();

  const token = () => localStorage.getItem('token');

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/financials`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) setDocs(json.data);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Please select a file');
    if (!uploadForm.document_type) return setError('Please select a document type');

    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      return setError(`File must be under ${MAX_MB} MB`);
    }

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        // Strip the data URL prefix: "data:...;base64,"
        const base64 = ev.target.result.split(',')[1];

        const res = await fetch(`${API}/api/financials`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`
          },
          body: JSON.stringify({
            document_type: uploadForm.document_type,
            file_name: file.name,
            mime_type: file.type,
            file_data: base64,
            fiscal_year: uploadForm.fiscal_year,
            description: uploadForm.description
          })
        });

        const json = await res.json();
        if (json.success) {
          await fetchDocs();
          setShowUpload(false);
          setUploadForm({ document_type: '990', fiscal_year: new Date().getFullYear() - 1, description: '' });
          fileRef.current.value = '';
        } else {
          setError(json.error || 'Upload failed');
        }
        setUploading(false);
      };
      reader.onerror = () => { setError('Failed to read file'); setUploading(false); };
      reader.readAsDataURL(file);
    } catch {
      setError('Upload failed');
      setUploading(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const res = await fetch(`${API}/api/financials/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (!res.ok) { setError('Download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_name || doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API}/api/financials/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` }
      });
      const json = await res.json();
      if (json.success) setDocs(prev => prev.filter(d => d.id !== id));
      else setError(json.error);
    } catch {
      setError('Delete failed');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const groupedDocs = DOC_TYPES.reduce((acc, t) => {
    const group = docs.filter(d => d.document_type === t.value);
    if (group.length > 0) acc[t.value] = group;
    return acc;
  }, {});

  return (
    <div className="vault-overlay" onClick={onClose}>
      <div className="vault-panel" onClick={e => e.stopPropagation()}>
        <div className="vault-header">
          <div className="vault-title">
            <span className="vault-icon">🔒</span>
            <div>
              <h2>Financials Vault</h2>
              <p>Secure storage for audits, 990s, budgets, and official documents</p>
            </div>
          </div>
          <button className="vault-close" onClick={onClose}>✕</button>
        </div>

        <div className="vault-security-notice">
          <strong>Secure & Private</strong> — Documents are encrypted at rest, accessible only to authorized users of your organization. Never shared with funders without your explicit action.
        </div>

        {error && (
          <div className="vault-error">
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <div className="vault-actions-bar">
          <button className="btn-primary" onClick={() => setShowUpload(s => !s)}>
            {showUpload ? 'Cancel Upload' : '+ Upload Document'}
          </button>
          <span className="vault-count">{docs.length} document{docs.length !== 1 ? 's' : ''} stored</span>
        </div>

        {/* Upload Form */}
        {showUpload && (
          <div className="vault-upload-form">
            <h3>Upload New Document</h3>
            <div className="upload-grid">
              <div className="form-group">
                <label>Document Type *</label>
                <select value={uploadForm.document_type} onChange={e => setUploadForm(f => ({ ...f, document_type: e.target.value }))}>
                  {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fiscal Year</label>
                <input type="number" value={uploadForm.fiscal_year} onChange={e => setUploadForm(f => ({ ...f, fiscal_year: e.target.value }))} min="2000" max={new Date().getFullYear()} />
              </div>
            </div>
            <div className="form-group">
              <label>Description (optional)</label>
              <input type="text" value={uploadForm.description} onChange={e => setUploadForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. FY2024 audited financials — clean opinion" />
            </div>
            <div className="form-group">
              <label>File (PDF, DOCX, XLSX — max 10 MB) *</label>
              <input type="file" ref={fileRef} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" className="file-input" />
            </div>
            <button className="btn-primary" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Securely'}
            </button>
          </div>
        )}

        {/* Document List */}
        <div className="vault-docs">
          {loading ? (
            <p className="vault-empty">Loading documents...</p>
          ) : docs.length === 0 ? (
            <div className="vault-empty-state">
              <div className="vault-empty-icon">📂</div>
              <h3>No documents yet</h3>
              <p>Upload your 990, audit, budget, and IRS determination letter. These documents strengthen your credibility with funders and are referenced in AI-generated proposals.</p>
              <div className="vault-checklist">
                {DOC_TYPES.slice(0, 5).map(t => (
                  <div key={t.value} className="checklist-item">
                    <span className="check-empty">○</span> {t.label}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            Object.entries(groupedDocs).map(([type, typeDocs]) => (
              <div key={type} className="vault-group">
                <h4 className="vault-group-label">{DOC_TYPE_LABELS[type]}</h4>
                {typeDocs.map(doc => (
                  <div key={doc.id} className="vault-doc-row">
                    <div className="vault-doc-icon">{type === '990' ? '📋' : type === 'audit' ? '✅' : type === 'budget' ? '💰' : type === 'irs_letter' ? '🏛' : '📄'}</div>
                    <div className="vault-doc-info">
                      <span className="vault-doc-name">{doc.original_name || doc.file_name}</span>
                      <span className="vault-doc-meta">
                        {doc.fiscal_year ? `FY${doc.fiscal_year}` : 'No year'}
                        {' · '}{formatBytes(doc.file_size_bytes)}
                        {doc.description ? ` · ${doc.description}` : ''}
                      </span>
                    </div>
                    <div className="vault-doc-actions">
                      <button className="btn-vault-action" onClick={() => handleDownload(doc)} title="Download">⬇</button>
                      <button className="btn-vault-action btn-vault-delete" onClick={() => handleDelete(doc.id)} title="Delete">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
