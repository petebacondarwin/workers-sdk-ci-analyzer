import { formatDuration, calculateTrend } from '../utils/helpers';

function DurationsView({ data, loading }) {
  if (loading || !data) {
    return (
      <div className="section">
        <h2>Turbo Task Durations</h2>
        <p className="description">Jobs and tasks sorted by average execution time</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Task Name</th>
                <th>Total Runs</th>
                <th>Avg Duration</th>
                <th>Min Duration</th>
                <th>Max Duration</th>
                <th>Trend</th>
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

  const taskDurations = Object.values(data.taskDurations || {})
    .sort((a, b) => b.avgDuration - a.avgDuration);

  if (taskDurations.length === 0) {
    return (
      <div className="section">
        <h2>Turbo Task Durations</h2>
        <p className="description">Jobs and tasks sorted by average execution time</p>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Task Name</th>
                <th>Total Runs</th>
                <th>Avg Duration</th>
                <th>Min Duration</th>
                <th>Max Duration</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="6" className="empty">No duration data available</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h2>Turbo Task Durations</h2>
      <p className="description">Jobs and tasks sorted by average execution time</p>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Task Name</th>
              <th>Total Runs</th>
              <th>Avg Duration</th>
              <th>Min Duration</th>
              <th>Max Duration</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {taskDurations.map((task, index) => {
              const trend = calculateTrend(task.durations);
              const trendIcon = trend > 5 ? '📈' : trend < -5 ? '📉' : '➡️';
              const trendClass = trend > 5 ? 'trend-up' : trend < -5 ? 'trend-down' : 'trend-stable';

              return (
                <tr key={index}>
                  <td>{task.name}</td>
                  <td>{task.totalRuns}</td>
                  <td>
                    <span className="duration">{formatDuration(task.avgDuration)}</span>
                  </td>
                  <td>
                    <span className="duration">{formatDuration(task.minDuration)}</span>
                  </td>
                  <td>
                    <span className="duration">{formatDuration(task.maxDuration)}</span>
                  </td>
                  <td>
                    <span className={`trend-indicator ${trendClass}`}>
                      {trendIcon} {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
                    </span>
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

export default DurationsView;
