import { useState, useRef } from 'react';
import '../styles/rfp-uploader.css';

const TEXT_TYPES = ['text/plain', 'text/html', 'text/markdown'];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export default function RFPUploader({ onUploadStart, onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileRef = useRef();

  const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  };
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (file) await processFile(file);
  };

  const processFile = async (file) => {
    setError(null);
    setIsLoading(true);
    setProgress(10);

    if (file.size > MAX_BYTES) {
      setError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum is 20 MB.`);
      setIsLoading(false);
      return;
    }

    try {
      let body;

      if (TEXT_TYPES.includes(file.type) || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        // Plain text — send directly
        const rfpText = await file.text();
        body = { rfpText, fileName: file.name };
      } else {
        // Binary (PDF, DOCX) — read as base64, let backend extract text
        setProgress(25);
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        body = { fileData: base64, mimeType: file.type, fileName: file.name };
      }

      setProgress(50);
      onUploadStart?.();

      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4006/api/rfp/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      setProgress(80);
      const result = await res.json();

      if (result.success) {
        setProgress(100);
        setTimeout(() => {
          onUploadComplete?.(result.data);
          setProgress(null);
          setIsLoading(false);
        }, 400);
      } else {
        setError(result.error || 'Upload failed');
        setIsLoading(false);
        setProgress(null);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed. Check your connection and try again.');
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) { setError('Paste some text first'); return; }
    setError(null);
    setIsLoading(true);
    setProgress(30);
    onUploadStart?.();

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:4006/api/rfp/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rfpText: pastedText, fileName: 'pasted-rfp.txt' })
      });
      setProgress(80);
      const result = await res.json();
      if (result.success) {
        setProgress(100);
        setPastedText('');
        setPasteMode(false);
        setTimeout(() => { onUploadComplete?.(result.data); setProgress(null); setIsLoading(false); }, 400);
      } else {
        setError(result.error || 'Upload failed');
        setIsLoading(false);
        setProgress(null);
      }
    } catch {
      setError('Upload failed');
      setIsLoading(false);
      setProgress(null);
    }
  };

  return (
    <div className="rfp-uploader">
      {!pasteMode ? (
        <div
          className={`upload-area ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={fileRef}
            type="file"
            id="rfp-file"
            accept=".pdf,.txt,.docx,.doc,.md"
            onChange={handleFileSelect}
            disabled={isLoading}
            style={{ display: 'none' }}
          />

          {isLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Extracting and analyzing RFP...</p>
              {progress && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>
          ) : (
            <label htmlFor="rfp-file" className="upload-label">
              <div className="upload-icon">📄</div>
              <h3>Drop RFP here or click to browse</h3>
              <p className="upload-formats">PDF · DOCX · TXT (up to 20 MB)</p>
              <p className="upload-hint">Full text extraction from PDF and Word documents</p>
            </label>
          )}
        </div>
      ) : (
        <div className="paste-area">
          <textarea
            className="paste-textarea"
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Paste RFP text here — the full grant opportunity description, requirements, eligibility criteria, etc."
            rows={10}
            disabled={isLoading}
          />
          <div className="paste-actions">
            <button className="btn-primary" onClick={handlePasteSubmit} disabled={isLoading || !pastedText.trim()}>
              {isLoading ? 'Analyzing...' : 'Analyze RFP Text'}
            </button>
            <button className="btn-secondary" onClick={() => { setPasteMode(false); setError(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {!isLoading && !pasteMode && (
        <button className="btn-paste-toggle" onClick={() => { setPasteMode(true); setError(null); }}>
          Or paste text instead
        </button>
      )}

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
