function Header({ loading, lastUpdated, runLimit, onLimitChange, onRefresh }) {
  return (
    <header>
      <h1>Workers SDK CI Analyzer</h1>
      <p className="subtitle">
        Analyzing CI health for{' '}
        <a href="https://github.com/cloudflare/workers-sdk" target="_blank" rel="noopener noreferrer">
          cloudflare/workers-sdk
        </a>
      </p>
      <div className="controls">
        <label htmlFor="run-limit">Workflow runs to analyze:</label>
        <select id="run-limit" value={runLimit} onChange={onLimitChange}>
          <option value="20">Last 20 runs</option>
          <option value="50">Last 50 runs</option>
          <option value="100">Last 100 runs</option>
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
