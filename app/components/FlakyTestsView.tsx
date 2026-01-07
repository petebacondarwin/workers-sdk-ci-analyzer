import { calculateFlakinessScore } from '../utils/helpers';

function FlakyTestsView({ data, loading }) {
  if (loading || !data) {
    return (
      <div className="section">
        <h2>Flaky Tests</h2>
        <p className="description">Tests that required retries or had multiple attempts</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Test/Job Name</th>
                <th>In-Run Retries</th>
                <th>Re-run Failures</th>
                <th>Detection Method</th>
                <th>Flakiness Score</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="6" className="empty">Loading data...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const flakyTests = Object.values(data.flakyTests || {})
    .sort((a, b) => {
      const scoreA = (a.retryCount || 0) + (a.rerunCount || 0);
      const scoreB = (b.retryCount || 0) + (b.rerunCount || 0);
      return scoreB - scoreA;
    });

  if (flakyTests.length === 0) {
    return (
      <div className="section">
        <h2>Flaky Tests</h2>
        <p className="description">Tests that required retries or had multiple attempts</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Test/Job Name</th>
                <th>In-Run Retries</th>
                <th>Re-run Failures</th>
                <th>Detection Method</th>
                <th>Flakiness Score</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="6" className="empty">No flaky tests detected in the analyzed runs</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>Flaky Tests</h2>
      <p className="description">Tests that required retries or had multiple attempts</p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Test/Job Name</th>
              <th>In-Run Retries</th>
              <th>Re-run Failures</th>
              <th>Detection Method</th>
              <th>Flakiness Score</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {flakyTests.map((test, index) => {
              const flakinessScore = calculateFlakinessScore(test);
              const badgeClass = flakinessScore >= 70 ? 'badge-danger' : 
                                flakinessScore >= 40 ? 'badge-warning' : 'badge-success';
              
              const hasRetries = test.retryCount > 0;
              const hasReruns = test.rerunCount > 0;
              
              let detectionMethods = [];
              if (hasRetries) detectionMethods.push('In-run retry');
              if (hasReruns) detectionMethods.push('Workflow re-run');

              return (
                <tr key={index}>
                  <td><strong>{test.name}</strong></td>
                  <td>
                    {test.retryCount || 0}
                    {hasRetries && (
                      <span className="badge badge-warning" style={{ fontSize: '0.7rem', marginLeft: '5px' }}>
                        {test.occurrences}x
                      </span>
                    )}
                  </td>
                  <td>
                    {test.rerunCount || 0}
                    {hasReruns && (
                      <span className="badge badge-danger" style={{ fontSize: '0.7rem', marginLeft: '5px' }}>
                        {test.rerunOccurrences} commits
                      </span>
                    )}
                  </td>
                  <td>
                    {detectionMethods.map((method, i) => (
                      <span 
                        key={i}
                        className={`badge ${method.includes('re-run') ? 'badge-danger' : 'badge-warning'}`}
                        style={{ fontSize: '0.75rem', marginRight: '5px' }}
                      >
                        {method}
                      </span>
                    ))}
                  </td>
                  <td>
                    <span className={`badge ${badgeClass}`}>{flakinessScore}%</span>
                  </td>
                  <td>
                    <div className="flaky-details">
                      {hasRetries && test.runs && test.runs.length > 0 && (
                        <div className="detail-section">
                          <strong>Retry runs:</strong>{' '}
                          {test.runs.slice(0, 3).map((run, i) => (
                            <span key={i} className="run-badge">
                              <a href={run.url} target="_blank" rel="noopener noreferrer">
                                #{run.runNumber}
                              </a>
                            </span>
                          ))}
                        </div>
                      )}
                      {hasReruns && test.rerunInstances && test.rerunInstances.length > 0 && (
                        <div className="detail-section">
                          <strong>Re-run commits:</strong>
                          <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                            {test.rerunInstances.slice(0, 3).map((instance, i) => (
                              <li key={i}>
                                <code>{instance.commit}</code> - {instance.attempts} attempts 
                                ({instance.failures} failed, {instance.successes} succeeded)
                                {instance.failedRuns && instance.failedRuns.length > 0 && (
                                  <span>
                                    {' - Failed: '}
                                    {instance.failedRuns.map((r, j) => (
                                      <span key={j}>
                                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                                          #{r.runNumber}
                                        </a>
                                        {j < instance.failedRuns.length - 1 && ', '}
                                      </span>
                                    ))}
                                  </span>
                                )}
                                {instance.successfulRuns && instance.successfulRuns.length > 0 && (
                                  <span>
                                    {' - Succeeded: '}
                                    {instance.successfulRuns.map((r, j) => (
                                      <span key={j}>
                                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                                          #{r.runNumber}
                                        </a>
                                        {j < instance.successfulRuns.length - 1 && ', '}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
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

export default FlakyTestsView;
