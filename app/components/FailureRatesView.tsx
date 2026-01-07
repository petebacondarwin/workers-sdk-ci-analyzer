function FailureRatesView({ data, loading }) {
  if (loading || !data) {
    return (
      <div className="section">
        <h2>Test Failure Rates</h2>
        <p className="description">Jobs and tests with the highest failure rates</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Job/Test Name</th>
                <th>Total Runs</th>
                <th>Failures</th>
                <th>Successes</th>
                <th>Failure Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="5" className="empty">Loading data...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const failureRates = Object.values(data.failureRates || {})
    .sort((a, b) => b.failureRate - a.failureRate)
    .filter(job => job.totalRuns > 0);

  if (failureRates.length === 0) {
    return (
      <div className="section">
        <h2>Test Failure Rates</h2>
        <p className="description">Jobs and tests with the highest failure rates</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Job/Test Name</th>
                <th>Total Runs</th>
                <th>Failures</th>
                <th>Successes</th>
                <th>Failure Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="5" className="empty">No failure data available</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>Test Failure Rates</h2>
      <p className="description">Jobs and tests with the highest failure rates</p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Job/Test Name</th>
              <th>Total Runs</th>
              <th>Failures</th>
              <th>Successes</th>
              <th>Failure Rate</th>
            </tr>
          </thead>
          <tbody>
            {failureRates.map((job, index) => {
              const badgeClass = job.failureRate >= 50 ? 'badge-danger' : 
                                job.failureRate >= 20 ? 'badge-warning' : 'badge-success';

              return (
                <tr key={index}>
                  <td>{job.name}</td>
                  <td>{job.totalRuns}</td>
                  <td>
                    <span className="badge badge-danger">{job.failures}</span>
                  </td>
                  <td>
                    <span className="badge badge-success">{job.successes}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div 
                          className="progress-fill" 
                          style={{ width: `${job.failureRate}%` }}
                        />
                      </div>
                      <span className={`badge ${badgeClass}`}>
                        {job.failureRate.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default FailureRatesView;
