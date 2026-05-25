import React, { useState } from 'react';
import './BulkActionsToolbar.css';

const BulkActionsToolbar = ({
  selectedGrants,
  onBulkUpdateStatus,
  onBulkExportCSV,
  onClearSelection
}) => {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');

  const statuses = ['draft', 'submitted', 'pending', 'funded', 'rejected'];

  const handleStatusSelect = (status) => {
    setSelectedStatus(status);
    setShowStatusDropdown(false);
    onBulkUpdateStatus(selectedGrants, status);
  };

  const handleExport = () => {
    onBulkExportCSV(selectedGrants);
  };

  if (selectedGrants.length === 0) return null;

  return (
    <div className="bulk-actions-toolbar">
      <div className="bulk-actions-left">
        <span className="bulk-selection-count">
          {selectedGrants.length} grant{selectedGrants.length !== 1 ? 's' : ''} selected
        </span>
      </div>

      <div className="bulk-actions-right">
        <div className="bulk-dropdown-wrapper">
          <button
            className="btn-bulk-action btn-bulk-status"
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          >
            📊 Update Status
          </button>
          {showStatusDropdown && (
            <div className="bulk-dropdown-menu">
              {statuses.map(status => (
                <button
                  key={status}
                  className="bulk-dropdown-item"
                  onClick={() => handleStatusSelect(status)}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn-bulk-action btn-bulk-export"
          onClick={handleExport}
        >
          📥 Export CSV
        </button>

        <button
          className="btn-bulk-action btn-bulk-clear"
          onClick={onClearSelection}
        >
          ✕ Clear
        </button>
      </div>
    </div>
  );
};

export default BulkActionsToolbar;
