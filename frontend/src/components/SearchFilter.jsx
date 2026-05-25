import React, { useState, useCallback, useRef } from 'react';
import './SearchFilter.css';

const SearchFilter = ({ onApplyFilters, onReset }) => {
  const [filters, setFilters] = useState({
    search: '',
    status: [],
    funder: '',
    deadline_before: '',
    deadline_after: '',
    amount_min: '',
    amount_max: '',
    sort: 'deadline:asc'
  });

  const debounceTimer = useRef(null);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setFilters(prev => ({ ...prev, search: value }));

    // Debounce search (300ms)
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      onApplyFilters({ ...filters, search: value });
    }, 300);
  };

  const handleStatusChange = (e) => {
    const { value, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      status: checked
        ? [...prev.status, value]
        : prev.status.filter(s => s !== value)
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleApplyFilters = () => {
    onApplyFilters(filters);
  };

  const handleReset = () => {
    const resetFilters = {
      search: '',
      status: [],
      funder: '',
      deadline_before: '',
      deadline_after: '',
      amount_min: '',
      amount_max: '',
      sort: 'deadline:asc'
    };
    setFilters(resetFilters);
    onReset();
  };

  const hasActiveFilters = filters.search || filters.status.length > 0 ||
                           filters.funder || filters.deadline_before ||
                           filters.deadline_after || filters.amount_min || filters.amount_max;

  return (
    <div className="search-filter">
      <div className="search-filter-header">
        <h3>Filter Grants</h3>
        {hasActiveFilters && (
          <button className="reset-btn" onClick={handleReset}>
            Reset Filters
          </button>
        )}
      </div>

      {/* Search Box */}
      <div className="filter-section">
        <label htmlFor="search">Search by Funder</label>
        <input
          id="search"
          type="text"
          placeholder="Search funder name..."
          value={filters.search}
          onChange={handleSearchChange}
          className="search-input"
        />
      </div>

      {/* Status Checkboxes */}
      <div className="filter-section">
        <label>Status</label>
        <div className="checkbox-group">
          {['draft', 'submitted', 'pending', 'funded', 'rejected'].map(status => (
            <label key={status} className="checkbox-label">
              <input
                type="checkbox"
                value={status}
                checked={filters.status.includes(status)}
                onChange={handleStatusChange}
              />
              <span className="capitalize">{status}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Funder Exact Match */}
      <div className="filter-section">
        <label htmlFor="funder">Funder Name</label>
        <input
          id="funder"
          type="text"
          placeholder="Filter by funder..."
          name="funder"
          value={filters.funder}
          onChange={handleInputChange}
          className="form-input"
        />
      </div>

      {/* Deadline Range */}
      <div className="filter-section">
        <label>Deadline Range</label>
        <div className="date-range">
          <input
            type="date"
            name="deadline_after"
            value={filters.deadline_after}
            onChange={handleInputChange}
            placeholder="From"
            className="form-input"
          />
          <span className="separator">to</span>
          <input
            type="date"
            name="deadline_before"
            value={filters.deadline_before}
            onChange={handleInputChange}
            placeholder="To"
            className="form-input"
          />
        </div>
      </div>

      {/* Amount Range */}
      <div className="filter-section">
        <label>Amount Range ($)</label>
        <div className="amount-range">
          <input
            type="number"
            name="amount_min"
            placeholder="Min"
            value={filters.amount_min}
            onChange={handleInputChange}
            min="0"
            className="form-input"
          />
          <span className="separator">to</span>
          <input
            type="number"
            name="amount_max"
            placeholder="Max"
            value={filters.amount_max}
            onChange={handleInputChange}
            min="0"
            className="form-input"
          />
        </div>
      </div>

      {/* Sort */}
      <div className="filter-section">
        <label htmlFor="sort">Sort By</label>
        <select
          id="sort"
          name="sort"
          value={filters.sort}
          onChange={handleInputChange}
          className="form-select"
        >
          <option value="deadline:asc">Deadline (Earliest First)</option>
          <option value="deadline:desc">Deadline (Latest First)</option>
          <option value="amount:asc">Amount (Low to High)</option>
          <option value="amount:desc">Amount (High to Low)</option>
          <option value="created_at:asc">Created (Oldest First)</option>
          <option value="created_at:desc">Created (Newest First)</option>
        </select>
      </div>

      {/* Action Buttons */}
      <div className="filter-actions">
        <button className="apply-btn" onClick={handleApplyFilters}>
          Apply Filters
        </button>
      </div>
    </div>
  );
};

export default SearchFilter;
