import type { TriageIssue } from '../hooks/useIssueTriage';

interface IssueTriageListProps {
  issues: TriageIssue[];
  emptyMessage?: string;
}

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
