import { useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function TrendsView({ data, loading }) {
  if (loading || !data || !data.runs || data.runs.length === 0) {
    return (
      <div className="section">
        <h2>CI Health Trends</h2>
        <p className="description">Historical trends of CI metrics over time</p>
        <div className="chart-container">
          <p className="empty">Loading trend data...</p>
        </div>
      </div>
    );
  }

  const runs = [...data.runs].reverse();
  const labels = runs.map(run => `#${run.run_number}`);

  // Flaky tests trend data
  const topFlakyTests = Object.values(data.flakyTests || {})
    .sort((a, b) => (b.retryCount || 0) + (b.rerunCount || 0) - ((a.retryCount || 0) + (a.rerunCount || 0)))
    .slice(0, 5);

  const colors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'];

  const flakyTrendData = {
    labels,
    datasets: topFlakyTests.map((test, index) => {
      const data = runs.map(run => {
        return (test.runs || []).filter(r => r.runId === run.id).length;
      });

      return {
        label: test.name.substring(0, 40) + (test.name.length > 40 ? '...' : ''),
        data: data,
        borderColor: colors[index],
        backgroundColor: colors[index] + '33',
        tension: 0.3,
      };
    }),
  };

  // Failure rate trend data
  const failureRateData = runs.map(run => {
    const totalJobs = run.jobs.length;
    const failedJobs = run.jobs.filter(job => job.conclusion === 'failure').length;
    return totalJobs > 0 ? (failedJobs / totalJobs) * 100 : 0;
  });

  const failureTrendData = {
    labels,
    datasets: [{
      label: 'Failure Rate (%)',
      data: failureRateData,
      borderColor: '#ef4444',
      backgroundColor: '#ef444433',
      fill: true,
      tension: 0.3,
    }],
  };

  // Duration trend data
  const topSlowTasks = Object.values(data.taskDurations || {})
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, 5);

  const durationTrendData = {
    labels,
    datasets: topSlowTasks.map((task, index) => {
      const data = runs.map(run => {
        const job = run.jobs.find(j => j.name === task.name);
        return job ? job.duration / 60 : null;
      });

      return {
        label: task.name.substring(0, 40) + (task.name.length > 40 ? '...' : ''),
        data: data,
        borderColor: colors[index],
        backgroundColor: colors[index] + '33',
        tension: 0.3,
      };
    }),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: { color: '#ffffff' },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { color: '#a0a0a0' },
        grid: { color: '#333333' },
      },
      x: {
        ticks: { color: '#a0a0a0' },
        grid: { color: '#333333' },
      },
    },
  };

  const failureChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        max: 100,
        ticks: {
          color: '#a0a0a0',
          callback: (value) => value + '%',
        },
      },
    },
  };

  const durationChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        ticks: {
          color: '#a0a0a0',
          callback: (value) => value.toFixed(1) + 'm',
        },
      },
    },
  };

  return (
    <div className="section">
      <h2>CI Health Trends</h2>
      <p className="description">Historical trends of CI metrics over time</p>

      {topFlakyTests.length > 0 && (
        <div className="chart-container">
          <h3>Top Flaky Tests Over Time</h3>
          <Line data={flakyTrendData} options={chartOptions} />
        </div>
      )}

      <div className="chart-container">
        <h3>Failure Rate Trend</h3>
        <Line data={failureTrendData} options={failureChartOptions} />
      </div>

      {topSlowTasks.length > 0 && (
        <div className="chart-container">
          <h3>Task Duration Trend (Top 5 Slowest)</h3>
          <Line data={durationTrendData} options={durationChartOptions} />
        </div>
      )}
    </div>
  );
}

export default TrendsView;
