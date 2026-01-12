import { useState, useMemo } from 'react';
import type { BusFactorData } from '../hooks/useBusFactor';

interface BusFactorTableProps {
  data: BusFactorData[];
  teamMembers: string[];
  loading?: boolean;
  error?: string | null;
  lastUpdated?: string | null;
  onRefresh?: () => void;
}

type SortKey = 'directory' | 'busFactor' | string; // string for team member names
type SortOrder = 'asc' | 'desc';

export default function BusFactorTable({
  data,
  teamMembers,
  loading,
  error,
  lastUpdated,
  onRefresh,
}: BusFactorTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('busFactor');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showTooltip, setShowTooltip] = useState(false);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let comparison = 0;

      if (sortKey === 'directory') {
        comparison = a.directory.localeCompare(b.directory);
      } else if (sortKey === 'busFactor') {
        comparison = a.busFactor - b.busFactor;
      } else {
        // Sorting by team member contribution
        const aVal = a.teamMemberContributions?.[sortKey] || 0;
        const bVal = b.teamMemberContributions?.[sortKey] || 0;
        comparison = aVal - bVal;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [data, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'directory' ? 'asc' : 'desc');
    }
  };

  const getBusFactorClass = (busFactor: number): string => {
    if (busFactor < 2) return 'bus-factor-critical';
    if (busFactor <= 3) return 'bus-factor-warning';
    return 'bus-factor-healthy';
  };

  // Find the highest contributor for each row
  const getHighestContributor = (item: BusFactorData): string | null => {
    let maxPercentage = 0;
    let maxContributor: string | null = null;

    teamMembers.forEach((member) => {
      const percentage = item.teamMemberContributions?.[member] || 0;
      if (percentage > maxPercentage) {
        maxPercentage = percentage;
        maxContributor = member;
      }
    });

    return maxPercentage > 0 ? maxContributor : null;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Analyzing bus factor for monitored directories...</p>
        <p className="note">This may take a minute as we fetch commit history.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Error loading bus factor data: {error}</p>
        {onRefresh && (
          <button onClick={onRefresh} className="sync-button">
            Try Again
          </button>
        )}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>No bus factor data available.</p>
        {onRefresh && (
          <button onClick={onRefresh} className="sync-button">
            Analyze Now
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bus-factor-table-container">
      <div className="bus-factor-header">
        <div className="bus-factor-title-row">
          <h3>Bus Factor Analysis</h3>
          <div className="tooltip-container">
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="tooltip-trigger"
            >
              ?
            </button>
            {showTooltip && (
              <div className="tooltip-content">
                <p className="tooltip-title">What is Bus Factor?</p>
                <p>
                  The minimum number of team members who need to be unavailable
                  before the project has insufficient knowledgeable contributors
                  to continue.
                </p>
                <p className="tooltip-note">
                  Calculated as the fewest contributors needed to account for
                  50% of commits in a directory.
                </p>
              </div>
            )}
          </div>
        </div>
        {lastUpdated && (
          <p className="last-updated">
            Last analyzed: {new Date(lastUpdated).toLocaleString()}
          </p>
        )}
      </div>

      <div className="bus-factor-table-wrapper">
        <table className="bus-factor-table">
          <thead>
            <tr>
              <th
                className="sortable"
                onClick={() => handleSort('directory')}
              >
                <div className="th-content">
                  Directory
                  {sortKey === 'directory' && (
                    <span className="sort-indicator">
                      {sortOrder === 'asc' ? ' ^' : ' v'}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="sortable center"
                onClick={() => handleSort('busFactor')}
              >
                <div className="th-content center">
                  Bus Factor
                  {sortKey === 'busFactor' && (
                    <span className="sort-indicator">
                      {sortOrder === 'asc' ? ' ^' : ' v'}
                    </span>
                  )}
                </div>
              </th>
              {teamMembers.map((member, index) => (
                <th
                  key={member}
                  className={`sortable center team-member-col ${index === 0 ? 'first-team-col' : ''}`}
                  onClick={() => handleSort(member)}
                >
                  <div className="th-content center">
                    <span className="member-name" title={member}>
                      {member}
                    </span>
                    {sortKey === member && (
                      <span className="sort-indicator">
                        {sortOrder === 'asc' ? ' ^' : ' v'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item) => {
              const highestContributor = getHighestContributor(item);
              return (
                <tr key={item.directory}>
                  <td className="directory-cell">
                    <code>{item.directory}</code>
                  </td>
                  <td className="center">
                    <span className={`bus-factor-badge ${getBusFactorClass(item.busFactor)}`}>
                      {item.busFactor}
                    </span>
                  </td>
                  {teamMembers.map((member, index) => (
                    <td
                      key={member}
                      className={`center team-member-cell ${index === 0 ? 'first-team-col' : ''} ${highestContributor === member ? 'highest-contributor' : ''}`}
                    >
                      {(item.teamMemberContributions?.[member] || 0).toFixed(1)}%
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bus-factor-legend">
        <p className="legend-title">Bus Factor Legend:</p>
        <div className="legend-items">
          <span className="legend-item">
            <span className="legend-dot bus-factor-critical"></span>
            &lt; 2 (Critical)
          </span>
          <span className="legend-item">
            <span className="legend-dot bus-factor-warning"></span>
            2-3 (Warning)
          </span>
          <span className="legend-item">
            <span className="legend-dot bus-factor-healthy"></span>
            &gt; 3 (Healthy)
          </span>
        </div>
      </div>
    </div>
  );
}
