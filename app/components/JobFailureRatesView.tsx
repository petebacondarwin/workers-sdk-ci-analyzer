interface JobStats {
  name: string;
  totalRuns: number;
  failures: number;
  successes: number;
  failureRate: number;
  last7Days: {
    totalRuns: number;
    failures: number;
    successes: number;
    failureRate: number;
  };
  recentFailures: Array<{
    runId: number;
    runNumber: number;
    runUrl: string;
    createdAt: string;
    jobUrl: string;
  }>;
}

interface JobFailureRatesViewProps {
  data: {
    jobStats: Record<string, JobStats>;
  } | null;
  loading: boolean;
}

export default function JobFailureRatesView({ data, loading }: JobFailureRatesViewProps) {
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

  // Convert to array and sort by failure rate (7-day) descending
  const jobsArray = Object.values(data.jobStats).sort((a, b) => {
    return b.last7Days.failureRate - a.last7Days.failureRate;
  });

  const getStatusClass = (failureRate: number) => {
    if (failureRate === 0) return 'status-success';
    if (failureRate < 5) return 'status-warning';
    return 'status-danger';
  };

  const formatPercent = (rate: number) => {
    return rate.toFixed(1) + '%';
  };

  return (
    <div className="job-failure-rates">
      <div className="stats-summary">
        <div className="stat-card">
          <h3>Total Job Types</h3>
          <div className="stat-value">{jobsArray.length}</div>
        </div>
        <div className="stat-card">
          <h3>Failing Jobs (7d)</h3>
          <div className="stat-value">
            {jobsArray.filter(j => j.last7Days.failureRate > 0).length}
          </div>
        </div>
        <div className="stat-card">
          <h3>Perfect Jobs (7d)</h3>
          <div className="stat-value">
            {jobsArray.filter(j => j.last7Days.failureRate === 0).length}
          </div>
        </div>
      </div>

      <div className="jobs-table-container">
        <table className="jobs-table">
          <thead>
            <tr>
              <th>Job Name</th>
              <th>7-Day Failure Rate</th>
              <th>7-Day Stats</th>
              <th>All-Time Failure Rate</th>
              <th>All-Time Stats</th>
              <th>Recent Failures</th>
            </tr>
          </thead>
          <tbody>
            {jobsArray.map((job) => (
              <tr key={job.name} className={getStatusClass(job.last7Days.failureRate)}>
                <td className="job-name">{job.name}</td>
                <td className="failure-rate">
                  <span className={`rate-badge ${getStatusClass(job.last7Days.failureRate)}`}>
                    {formatPercent(job.last7Days.failureRate)}
                  </span>
                </td>
                <td className="stats">
                  <span className="failure-count">{job.last7Days.failures} failures</span>
                  {' / '}
                  <span className="success-count">{job.last7Days.successes} successes</span>
                  {' / '}
                  <span className="total-count">{job.last7Days.totalRuns} total</span>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
