import type { PRHealthItem, PRHealthStats, SortKey, SortOrder } from '../hooks/usePRHealth';

interface PRHealthTableProps {
  prs: PRHealthItem[];
  stats: PRHealthStats | null;
  sortBy: SortKey;
  sortOrder: SortOrder;
  onSortChange: (key: SortKey) => void;
}

export default function PRHealthTable({
  prs,
  stats,
  sortBy,
  sortOrder,
  onSortChange,
}: PRHealthTableProps) {
  const getStalenessClass = (days: number): string => {
    if (days > 30) return 'staleness-critical';
    if (days > 14) return 'staleness-warning';
    if (days > 7) return 'staleness-moderate';
    return 'staleness-fresh';
  };

  const getAgeClass = (days: number): string => {
    if (days > 90) return 'age-ancient';
    if (days > 30) return 'age-old';
    if (days > 14) return 'age-moderate';
    return 'age-new';
  };

  const formatDays = (days: number): string => {
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days < 7) return `${days} days`;
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    }
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month' : `${months} months`;
  };

  const handleSort = (key: SortKey) => {
    onSortChange(key);
  };

  const getSortIndicator = (key: SortKey) => {
    if (sortBy !== key) return null;
    return sortOrder === 'desc' ? ' v' : ' ^';
  };

  if (prs.length === 0) {
    return (
      <div className="pr-health-empty">
        No open pull requests found.
      </div>
    );
  }

  return (
    <div className="pr-health-container">
      {/* Summary Stats */}
      {stats && (
        <div className="pr-health-stats">
          <div className="stat-card">
            <span className="stat-value">{prs.length}</span>
            <span className="stat-label">Open PRs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.avgAgeDays}</span>
            <span className="stat-label">Avg Age (days)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.avgStaleDays}</span>
            <span className="stat-label">Avg Stale (days)</span>
          </div>
          <div className="stat-card warning">
            <span className="stat-value">{stats.staleCount}</span>
            <span className="stat-label">Stale (&gt;14 days)</span>
          </div>
          <div className="stat-card critical">
            <span className="stat-value">{stats.veryStaleCount}</span>
            <span className="stat-label">Very Stale (&gt;30 days)</span>
          </div>
        </div>
      )}

      {/* PR Table */}
      <div className="pr-health-table-wrapper">
        <table className="pr-health-table">
          <thead>
            <tr>
              <th className="pr-col">Pull Request</th>
              <th 
                className="sortable center"
                onClick={() => handleSort('stale')}
              >
                <div className="th-content center">
                  Stale
                  <span className="sort-indicator">{getSortIndicator('stale')}</span>
                </div>
              </th>
              <th 
                className="sortable center"
                onClick={() => handleSort('age')}
              >
                <div className="th-content center">
                  Age
                  <span className="sort-indicator">{getSortIndicator('age')}</span>
                </div>
              </th>
              <th 
                className="sortable center"
                onClick={() => handleSort('comments')}
              >
                <div className="th-content center">
                  Comments
                  <span className="sort-indicator">{getSortIndicator('comments')}</span>
                </div>
              </th>
              <th className="author-col">Author</th>
            </tr>
          </thead>
          <tbody>
            {prs.map((pr) => (
              <tr key={pr.number}>
                <td className="pr-cell">
                  <div className="pr-info">
                    <a
                      href={`https://github.com/cloudflare/workers-sdk/pull/${pr.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pr-link"
                    >
                      #{pr.number} {pr.title}
                    </a>
                    {pr.labels.length > 0 && (
                      <div className="pr-labels">
                        {pr.labels.slice(0, 3).map((label) => (
                          <span
                            key={label.name}
                            className="pr-label"
                            style={{
                              backgroundColor: `#${label.color}20`,
                              color: `#${label.color}`,
                              borderColor: `#${label.color}40`,
                            }}
                          >
                            {label.name}
                          </span>
                        ))}
                        {pr.labels.length > 3 && (
                          <span className="pr-label-more">
                            +{pr.labels.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="center">
                  <span className={`staleness-badge ${getStalenessClass(pr.staleDays)}`}>
                    {formatDays(pr.staleDays)}
                  </span>
                </td>
                <td className="center">
                  <span className={`age-badge ${getAgeClass(pr.ageDays)}`}>
                    {formatDays(pr.ageDays)}
                  </span>
                </td>
                <td className="center">
                  <span className="comment-count">
                    {pr.commentCount}
                  </span>
                </td>
                <td className="author-cell">
                  {pr.author && (
                    <div className="pr-author">
                      <img
                        src={pr.author.avatarUrl}
                        alt={pr.author.login}
                        className="pr-avatar"
                      />
                      <span>{pr.author.login}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="pr-health-legend">
        <p className="legend-title">Staleness Legend:</p>
        <div className="legend-items">
          <span className="legend-item">
            <span className="legend-dot staleness-fresh"></span>
            &lt; 7 days (Fresh)
          </span>
          <span className="legend-item">
            <span className="legend-dot staleness-moderate"></span>
            7-14 days (Moderate)
          </span>
          <span className="legend-item">
            <span className="legend-dot staleness-warning"></span>
            14-30 days (Stale)
          </span>
          <span className="legend-item">
            <span className="legend-dot staleness-critical"></span>
            &gt; 30 days (Very Stale)
          </span>
        </div>
      </div>
    </div>
  );
}
