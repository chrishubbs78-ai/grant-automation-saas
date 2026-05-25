import { useState } from 'react';
import '../styles/rfp-uploader.css';

export default function RFPUploader({ onUploadStart, onUploadComplete }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await uploadRFP(files[0]);
    }
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      await uploadRFP(files[0]);
    }
  };

  const uploadRFP = async (file) => {
    setError(null);
    setIsLoading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('token');

      // For MVP, read file as text
      const rfpText = await file.text();

      setUploadProgress(50);
      onUploadStart?.();

      const response = await fetch('http://localhost:4006/api/rfp/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          rfpText,
          fileName: file.name
        })
      });

      const result = await response.json();

      if (result.success) {
        setUploadProgress(100);
        setTimeout(() => {
          onUploadComplete?.(result.data);
          setUploadProgress(null);
          setIsLoading(false);
        }, 500);
      } else {
        setError(result.error || 'Upload failed');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setError('Failed to upload RFP');
      setIsLoading(false);
    }
  };

  return (
    <div className="rfp-uploader">
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="rfp-file"
          accept=".pdf,.txt,.docx"
          onChange={handleFileSelect}
          disabled={isLoading}
          style={{ display: 'none' }}
        />

        {isLoading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Analyzing RFP...</p>
            {uploadProgress && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            )}
          </div>
        ) : (
          <label htmlFor="rfp-file" className="upload-label">
            <div className="upload-icon">📄</div>
            <h3>Drop RFP here or click to browse</h3>
            <p>PDF, TXT, or DOCX (up to 10MB)</p>
          </label>
        )}
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
}
