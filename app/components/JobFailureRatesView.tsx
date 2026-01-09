import { useState } from 'react';

interface JobInstance {
  jobId: number;
  runId: number;
  runNumber: number;
  conclusion: string;
  createdAt: string;
  jobUrl: string;
  runUrl: string;
  startedAt: string;
  completedAt: string;
}

interface JobStats {
  name: string;
  totalRuns: number;
  failures: number;
  successes: number;
  failureRate: number;
  recentFailures: Array<{
    runId: number;
    runNumber: number;
    runUrl: string;
    createdAt: string;
    jobUrl: string;
  }>;
  instances: JobInstance[];
}

interface JobFailureRatesViewProps {
  data: {
    jobStats: Record<string, JobStats>;
  } | null;
  loading: boolean;
}

export default function JobFailureRatesView({ data, loading }: JobFailureRatesViewProps) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  if (loading && !data) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading CI data...</p>
      </div>
    );
  }

  if (!data || !data.jobStats) {
    return (
      <div className="empty-state">
        <p>No data available</p>
      </div>
    );
  }

  // Convert to array and sort by failure rate descending
  const jobsArray = Object.values(data.jobStats).sort((a, b) => {
    return b.failureRate - a.failureRate;
  });

  const getStatusClass = (failureRate: number) => {
    if (failureRate === 0) return 'status-success';
    if (failureRate < 5) return 'status-warning';
    return 'status-danger';
  };

  const formatPercent = (rate: number) => {
    return rate.toFixed(1) + '%';
  };

  const toggleExpanded = (jobName: string) => {
    setExpandedJob(expandedJob === jobName ? null : jobName);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="job-failure-rates">
      <div className="jobs-table-container">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job Name</th>
              <th>Failure Rate</th>
              <th>Stats</th>
              <th>Recent Failures</th>
            </tr>
          </thead>
          <tbody>
            {jobsArray.map((job) => (
              <>
                <tr 
                  key={job.name} 
                  className={`${getStatusClass(job.failureRate)} ${expandedJob === job.name ? 'expanded' : ''}`}
                  onClick={() => toggleExpanded(job.name)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="job-name">
                    <span className="expand-icon">{expandedJob === job.name ? '▼' : '▶'}</span>
                    {job.name}
                  </td>
                  <td className="failure-rate">
                    <span className={`rate-badge ${getStatusClass(job.failureRate)}`}>
                      {formatPercent(job.failureRate)}
                    </span>
                  </td>
                  <td className="stats">
                    <span className="failure-count">{job.failures} failures</span>
                    {' / '}
                    <span className="success-count">{job.successes} successes</span>
                    {' / '}
                    <span className="total-count">{job.totalRuns} total</span>
                  </td>
                  <td className="recent-failures">
                    {job.recentFailures.length > 0 ? (
                      <div className="failure-links">
                        {job.recentFailures.map((failure, idx) => (
                          <a
                            key={failure.runId}
                            href={failure.jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="failure-link"
                            title={`Run #${failure.runNumber} - ${new Date(failure.createdAt).toLocaleString()}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            #{failure.runNumber}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="no-failures">None</span>
                    )}
                  </td>
                </tr>
                {expandedJob === job.name && (
                  <tr key={`${job.name}-details`} className="job-details-row">
                    <td colSpan={4}>
                      <div className="job-instances">
                        <h4>Job Instances ({job.instances?.length || 0} total)</h4>
                        {!job.instances || job.instances.length === 0 ? (
                          <div className="empty-state">
                            <p>No instance data available for this date range.</p>
                          </div>
                        ) : (
                          <div className="instances-list">
                            {job.instances.map((instance) => (
                            <div key={instance.jobId} className={`instance-item ${instance.conclusion}`}>
                              <div className="instance-info">
                                <span className={`instance-status ${instance.conclusion}`}>
                                  {instance.conclusion === 'success' ? '✓' : '✗'} {instance.conclusion}
                                </span>
                                <span className="instance-run">Run #{instance.runNumber}</span>
                                <span className="instance-date">{formatDate(instance.createdAt)}</span>
                              </div>
                              <a
                                href={instance.jobUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="instance-link"
                              >
                                View Logs →
                              </a>
                            </div>
                          ))}
                        </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
