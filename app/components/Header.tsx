import React from 'react';

interface HeaderProps {
  loading: boolean;
  lastUpdated: Date | null;
}

function Header({ loading, lastUpdated }: HeaderProps) {
  return (
    <header>
      <div className="controls">
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
