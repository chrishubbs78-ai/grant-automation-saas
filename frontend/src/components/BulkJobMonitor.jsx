import React, { useState, useEffect } from 'react';
import './BulkJobMonitor.css';

const BulkJobMonitor = ({ jobId, onComplete, onClose }) => {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Poll job status
  useEffect(() => {
    const pollJob = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:4006/api/bulk/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const result = await response.json();
          setJob(result.data);
          setError(null);

          // Stop polling if complete or error
          if (result.data.status === 'complete' || result.data.status === 'error') {
            setLoading(false);
            if (onComplete) {
              onComplete(result.data);
            }
          }
        } else {
          setError('Failed to fetch job status');
          setLoading(false);
        }
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    // Initial poll
    pollJob();

    // Set up polling interval (every 1 second)
    const interval = setInterval(pollJob, 1000);

    return () => clearInterval(interval);
  }, [jobId, onComplete]);

  if (!job) {
    return (
      <div className="bulk-job-monitor">
        <div className="monitor-header">
          <h3>Processing Bulk Operation...</h3>
          <button className="btn-close-monitor" onClick={onClose}>✕</button>
        </div>
        <div className="monitor-loading">Loading...</div>
      </div>
    );
  }

  const progress = job.total_items > 0 ? (job.processed_items / job.total_items) * 100 : 0;
  const operationLabel = {
    bulk_update_status: 'Updating Status',
    bulk_export_csv: 'Exporting CSV',
    bulk_import_rfps: 'Importing RFPs'
  }[job.operation_type];

  return (
    <div className="bulk-job-monitor">
      <div className="monitor-header">
        <h3>{operationLabel}</h3>
        <button className="btn-close-monitor" onClick={onClose}>✕</button>
      </div>

      {error && (
        <div className="monitor-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="monitor-progress">
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="progress-text">
          {job.processed_items} of {job.total_items} items processed
          ({Math.round(progress)}%)
        </div>
      </div>

      {job.status === 'complete' && (
        <div className="monitor-success">
          <strong>✓ Operation Complete</strong>
          {job.result_url && (
            <div className="monitor-download">
              <a href={job.result_url} download className="btn-download">
                📥 Download Result
              </a>
            </div>
          )}
        </div>
      )}

      {job.status === 'error' && (
        <div className="monitor-error-detail">
          <strong>Operation Failed</strong>
          <p>{job.error_message}</p>
        </div>
      )}

      <div className="monitor-status">
        Status: <strong>{job.status.toUpperCase()}</strong>
      </div>
    </div>
  );
};

export default BulkJobMonitor;
