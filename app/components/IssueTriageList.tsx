import type { TriageIssue } from '../hooks/useIssueTriage';

interface IssueTriageListProps {
  issues: TriageIssue[];
  emptyMessage?: string;
}

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

export default function IssueTriageList({ issues, emptyMessage }: IssueTriageListProps) {
  if (issues.length === 0) {
    return (
      <div className="triage-empty">
        {emptyMessage || 'No issues found in this category.'}
      </div>
    );
  }

  return (
    <div className="triage-list">
      {issues.map((issue) => (
        <div key={issue.number} className="triage-item">
          <div className="triage-item-header">
            <a
              href={`https://github.com/cloudflare/workers-sdk/issues/${issue.number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="triage-item-link"
            >
              #{issue.number} {issue.title}
            </a>
            <div className="triage-item-badges">
              <span 
                className={`staleness-badge ${getStalenessClass(issue.staleDays)}`}
                title="Time since last update"
              >
                {formatDays(issue.staleDays)} stale
              </span>
              <span 
                className={`age-badge ${getAgeClass(issue.ageDays)}`}
                title="Age since creation"
              >
                {formatDays(issue.ageDays)} old
              </span>
            </div>
          </div>

          <div className="triage-item-meta">
            {issue.author && (
              <>
                <span className="triage-author">
                  <img 
                    src={issue.author.avatarUrl} 
                    alt={issue.author.login}
                    className="triage-avatar"
                  />
                  {issue.author.login}
                </span>
                <span className="triage-separator">-</span>
              </>
            )}
            <span className="triage-date">
              {new Date(issue.createdAt).toLocaleDateString()}
            </span>

            {issue.labels.length > 0 && (
              <>
                <span className="triage-separator">-</span>
                <div className="triage-labels">
                  {issue.labels.map((label) => (
                    <span
                      key={label.name}
                      className="triage-label"
                      style={{
                        backgroundColor: `#${label.color}20`,
                        color: `#${label.color}`,
                        borderColor: `#${label.color}40`,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
