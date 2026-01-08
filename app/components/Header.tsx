import React from 'react';

interface HeaderProps {
  loading: boolean;
  lastUpdated: Date | null;
  runLimit: number;
  onLimitChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onRefresh: () => void;
}

function Header({ loading, lastUpdated, runLimit, onLimitChange, onRefresh }: HeaderProps) {
  return (
    <header>
      <div className="controls">
        <label htmlFor="run-limit">Workflow runs:</label>
        <select id="run-limit" value={runLimit} onChange={onLimitChange}>
          <option value="50">Last 50 runs</option>
          <option value="100">Last 100 runs</option>
          <option value="200">Last 200 runs</option>
        </select>
        <button id="refresh-btn" onClick={onRefresh} disabled={loading}>
          Refresh Data
        </button>
        {loading && <span className="loading">Loading...</span>}
        {lastUpdated && !loading && (
          <span id="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </header>
  );
}

export default Header;
