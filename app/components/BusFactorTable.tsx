import { useState, useMemo } from 'react';
import type { BusFactorData, TeamMember } from '../hooks/useBusFactor';

interface BusFactorTableProps {
  data: BusFactorData[];
  teamMembers: TeamMember[];
  loading?: boolean;
  error?: string | null;
  lastUpdated?: string | null;
  onRefresh?: () => void;
}

// Helper to get display name for a team member
function getDisplayName(member: TeamMember): string {
  return member.name || member.login;
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

  // Sort team members by their "criticality" - number of critical directories they own
  const sortedTeamMembers = useMemo(() => {
    // Calculate criticality score for each team member
    const memberScores = teamMembers.map((member) => {
      let criticalCount = 0;
      let totalContribution = 0;

      data.forEach((item) => {
        const contribution = item.teamMemberContributions?.[member.login] || 0;
        // Count directories where: bus factor <= 2 AND contribution >= 10%
        if (item.busFactor <= 2 && contribution >= 10) {
          criticalCount++;
          totalContribution += contribution;
        }
      });

      return {
        member,
        criticalCount,
        totalContribution,
      };
    });

    // Sort by critical count (desc), then by total contribution (desc)
    return memberScores
      .sort((a, b) => {
        if (b.criticalCount !== a.criticalCount) {
          return b.criticalCount - a.criticalCount;
        }
        return b.totalContribution - a.totalContribution;
      })
      .map((s) => s.member);
  }, [data, teamMembers]);

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

  // Find the highest contributor (by login) for each row
  const getHighestContributorLogin = (item: BusFactorData): string | null => {
    let maxPercentage = 0;
    let maxContributorLogin: string | null = null;

    sortedTeamMembers.forEach((member) => {
      const percentage = item.teamMemberContributions?.[member.login] || 0;
      if (percentage > maxPercentage) {
        maxPercentage = percentage;
        maxContributorLogin = member.login;
      }
    });

    return maxPercentage > 0 ? maxContributorLogin : null;
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
              {sortedTeamMembers.map((member, index) => (
                <th
                  key={member.login}
                  className={`sortable center team-member-col ${index === 0 ? 'first-team-col' : ''}`}
                  onClick={() => handleSort(member.login)}
                >
                  <div className="th-content center">
                    <img 
                      src={member.avatarUrl} 
                      alt={getDisplayName(member)} 
                      className="member-avatar"
                      width={24}
                      height={24}
                    />
                    <span className="member-name" title={member.login}>
                      {getDisplayName(member)}
                    </span>
                    {sortKey === member.login && (
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
              const highestContributorLogin = getHighestContributorLogin(item);
              return (
                <tr key={item.directory}>
                  <td className="directory-cell">
                    <a
                      href={`https://github.com/cloudflare/workers-sdk/tree/main/${item.directory}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="directory-link"
                    >
                      <code>{item.directory}</code>
                    </a>
                  </td>
                  <td className="center">
                    <span className={`bus-factor-badge ${getBusFactorClass(item.busFactor)}`}>
                      {item.busFactor}
                    </span>
                  </td>
                  {sortedTeamMembers.map((member, index) => (
                    <td
                      key={member.login}
                      className={`center team-member-cell ${index === 0 ? 'first-team-col' : ''} ${highestContributorLogin === member.login ? 'highest-contributor' : ''}`}
                    >
                      {(item.teamMemberContributions?.[member.login] || 0).toFixed(1)}%
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
