import { useState, useMemo } from 'react';
import type { BusFactorData, TeamMember } from '../hooks/useBusFactor';

interface BusFactorByUserTableProps {
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

interface UserBusFactorData {
  login: string;
  displayName: string;
  avatarUrl: string;
  criticalDirectories: Array<{
    directory: string;
    contribution: number;
    busFactor: number;
  }>;
  totalCriticalDirectories: number;
  averageContribution: number;
}

type SortKey = 'user' | 'criticalCount' | 'avgContribution';
type SortOrder = 'asc' | 'desc';

export default function BusFactorByUserTable({
  data,
  teamMembers,
  loading,
  error,
  lastUpdated,
  onRefresh,
}: BusFactorByUserTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('criticalCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showTooltip, setShowTooltip] = useState(false);

  // Transform data: group by user showing directories where they have critical bus factor
  const userBusFactorData = useMemo(() => {
    const userMap = new Map<string, UserBusFactorData>();

    // Initialize all team members
    teamMembers.forEach((member) => {
      userMap.set(member.login, {
        login: member.login,
        displayName: getDisplayName(member),
        avatarUrl: member.avatarUrl,
        criticalDirectories: [],
        totalCriticalDirectories: 0,
        averageContribution: 0,
      });
    });

    // For each directory, find users who are critical (high contribution in low bus factor dirs)
    data.forEach((item) => {
      // Consider a user "critical" for a directory if:
      // 1. The directory has bus factor <= 2 (critical or warning)
      // 2. The user has significant contribution (>= 10%)
      const isCriticalDirectory = item.busFactor <= 2;

      teamMembers.forEach((member) => {
        const contribution = item.teamMemberContributions?.[member.login] || 0;
        
        // User is critical if they have significant contribution in a critical directory
        if (isCriticalDirectory && contribution >= 10) {
          const userData = userMap.get(member.login)!;
          userData.criticalDirectories.push({
            directory: item.directory,
            contribution,
            busFactor: item.busFactor,
          });
        }
      });
    });

    // Calculate totals and averages
    userMap.forEach((userData) => {
      userData.totalCriticalDirectories = userData.criticalDirectories.length;
      if (userData.criticalDirectories.length > 0) {
        const totalContribution = userData.criticalDirectories.reduce(
          (sum, dir) => sum + dir.contribution,
          0
        );
        userData.averageContribution = totalContribution / userData.criticalDirectories.length;
      }
      // Sort critical directories by contribution (highest first)
      userData.criticalDirectories.sort((a, b) => b.contribution - a.contribution);
    });

    return Array.from(userMap.values());
  }, [data, teamMembers]);

  const sortedData = useMemo(() => {
    return [...userBusFactorData].sort((a, b) => {
      let comparison = 0;

      if (sortKey === 'user') {
        comparison = a.displayName.localeCompare(b.displayName);
      } else if (sortKey === 'criticalCount') {
        comparison = a.totalCriticalDirectories - b.totalCriticalDirectories;
      } else if (sortKey === 'avgContribution') {
        comparison = a.averageContribution - b.averageContribution;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [userBusFactorData, sortKey, sortOrder]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder(key === 'user' ? 'asc' : 'desc');
    }
  };

  const getCriticalCountClass = (count: number): string => {
    if (count >= 5) return 'bus-factor-critical';
    if (count >= 2) return 'bus-factor-warning';
    return 'bus-factor-healthy';
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
          <h3>Bus Factor by User</h3>
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
                <p className="tooltip-title">Critical Directories</p>
                <p>
                  Shows directories where a user has significant ownership
                  (10%+ commits) and the bus factor is critical (1) or warning (2).
                </p>
                <p className="tooltip-note">
                  Users with many critical directories are key knowledge holders
                  and potential single points of failure.
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
        <table className="bus-factor-table bus-factor-by-user-table">
          <thead>
            <tr>
              <th
                className="sortable"
                onClick={() => handleSort('user')}
              >
                <div className="th-content">
                  User
                  {sortKey === 'user' && (
                    <span className="sort-indicator">
                      {sortOrder === 'asc' ? ' ^' : ' v'}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="sortable center"
                onClick={() => handleSort('criticalCount')}
              >
                <div className="th-content center">
                  Critical Dirs
                  {sortKey === 'criticalCount' && (
                    <span className="sort-indicator">
                      {sortOrder === 'asc' ? ' ^' : ' v'}
                    </span>
                  )}
                </div>
              </th>
              <th
                className="sortable center"
                onClick={() => handleSort('avgContribution')}
              >
                <div className="th-content center">
                  Avg Contribution
                  {sortKey === 'avgContribution' && (
                    <span className="sort-indicator">
                      {sortOrder === 'asc' ? ' ^' : ' v'}
                    </span>
                  )}
                </div>
              </th>
              <th>
                <div className="th-content">
                  Top Critical Directories
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((item) => (
              <tr key={item.login}>
                <td className="user-cell">
                  <div className="user-info">
                    <img 
                      src={item.avatarUrl} 
                      alt={item.displayName} 
                      className="member-avatar"
                      width={24}
                      height={24}
                    />
                    <code title={item.login}>{item.displayName}</code>
                  </div>
                </td>
                <td className="center">
                  <span className={`bus-factor-badge ${getCriticalCountClass(item.totalCriticalDirectories)}`}>
                    {item.totalCriticalDirectories}
                  </span>
                </td>
                <td className="center">
                  {item.averageContribution > 0
                    ? `${item.averageContribution.toFixed(1)}%`
                    : '-'}
                </td>
                <td className="critical-dirs-cell">
                  {item.criticalDirectories.length > 0 ? (
                    <div className="critical-dirs-list">
                      {item.criticalDirectories.slice(0, 5).map((dir) => (
                        <a
                          key={dir.directory}
                          href={`https://github.com/cloudflare/workers-sdk/tree/main/${dir.directory}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`critical-dir-tag ${dir.busFactor === 1 ? 'critical' : 'warning'}`}
                          title={`${dir.contribution.toFixed(1)}% contribution, bus factor: ${dir.busFactor}`}
                        >
                          {dir.directory.replace('packages/', '').replace('/src/', '/')}
                          <span className="contribution-badge">{dir.contribution.toFixed(0)}%</span>
                        </a>
                      ))}
                      {item.criticalDirectories.length > 5 && (
                        <span className="more-dirs">
                          +{item.criticalDirectories.length - 5} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="no-critical">No critical directories</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bus-factor-legend">
        <p className="legend-title">Critical Directory Count:</p>
        <div className="legend-items">
          <span className="legend-item">
            <span className="legend-dot bus-factor-critical"></span>
            5+ (High Risk)
          </span>
          <span className="legend-item">
            <span className="legend-dot bus-factor-warning"></span>
            2-4 (Moderate)
          </span>
          <span className="legend-item">
            <span className="legend-dot bus-factor-healthy"></span>
            0-1 (Low)
          </span>
        </div>
      </div>
    </div>
  );
}
