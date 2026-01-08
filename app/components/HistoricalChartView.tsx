import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface HistoricalSnapshot {
  timestamp: string;
  date: string;
  jobs: Record<string, {
    failureRate: number;
    failures: number;
    successes: number;
    last7DaysFailureRate: number;
    last7DaysFailures: number;
    last7DaysSuccesses: number;
  }>;
}

interface HistoricalChartViewProps {
  dateRange: { start: string; end: string };
}

export default function HistoricalChartView({ dateRange }: HistoricalChartViewProps) {
  const [snapshots, setSnapshots] = useState<HistoricalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      
      try {
        // Calculate days between start and end
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        const response = await fetch(`/api/history?days=${days}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        const allSnapshots = result.snapshots || [];
        
        // Filter snapshots by date range
        const filtered = allSnapshots.filter((s: HistoricalSnapshot) => {
          const snapshotDate = new Date(s.date);
          return snapshotDate >= start && snapshotDate <= end;
        });
        
        setSnapshots(filtered);
      } catch (err) {
        console.error('Error loading history:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    fetchHistory();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading historical data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        Failed to load historical data: {error}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="empty-state">
        <p>No historical data available for the selected date range.</p>
        <p className="note">Historical data is collected daily. Please check back later.</p>
      </div>
    );
  }

  // Get all unique job names
  const allJobNames = new Set<string>();
  snapshots.forEach(snapshot => {
    Object.keys(snapshot.jobs).forEach(name => allJobNames.add(name));
  });
  const sortedJobNames = Array.from(allJobNames).sort();

  // Prepare chart data
  const labels = snapshots.map(s => s.date);
  
  const colors = [
    'rgb(239, 68, 68)',   // red
    'rgb(234, 179, 8)',   // yellow
    'rgb(59, 130, 246)',  // blue
    'rgb(168, 85, 247)',  // purple
    'rgb(236, 72, 153)',  // pink
    'rgb(249, 115, 22)',  // orange
    'rgb(20, 184, 166)',  // teal
    'rgb(34, 197, 94)',   // green
    'rgb(251, 146, 60)',  // amber
    'rgb(244, 63, 94)',   // rose
    'rgb(139, 92, 246)',  // violet
    'rgb(6, 182, 212)',   // cyan
  ];

  const datasets = sortedJobNames.map((jobName, index) => {
    const data = snapshots.map(snapshot => {
      const jobData = snapshot.jobs[jobName];
      return jobData ? jobData.last7DaysFailureRate : null;
    });

    return {
      label: jobName,
      data: data,
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length].replace('rgb', 'rgba').replace(')', ', 0.1)'),
      borderWidth: 2,
      tension: 0.3,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 5
    };
  });

  const chartData = {
    labels,
    datasets
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: '#ffffff',
          padding: 10,
          font: {
            size: 11
          },
          boxWidth: 20,
          boxHeight: 2
        }
      },
      title: {
        display: true,
        text: '7-Day Rolling Average Failure Rate Over Time',
        color: '#ffffff',
        font: {
          size: 18,
          weight: 'bold'
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(1) + '%';
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Failure Rate (%)',
          color: '#ffffff',
          font: {
            size: 12
          }
        },
        ticks: {
          color: '#a0a0a0',
          callback: function(value) {
            return value + '%';
          }
        },
        grid: {
          color: '#333333'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Date',
          color: '#ffffff',
          font: {
            size: 12
          }
        },
        ticks: {
          color: '#a0a0a0',
          maxRotation: 45,
          minRotation: 45
        },
        grid: {
          color: '#333333'
        }
      }
    }
  };

  return (
    <div className="historical-chart-view">
      <div className="chart-container-wrapper">
        <div className="chart-container" style={{ height: '600px' }}>
          <Line data={chartData} options={options} />
        </div>
      </div>

      <div className="chart-info">
        <p>
          Showing {snapshots.length} data point{snapshots.length !== 1 ? 's' : ''} from{' '}
          {snapshots[0]?.date} to {snapshots[snapshots.length - 1]?.date}
        </p>
        <p>Displaying {sortedJobNames.length} job{sortedJobNames.length !== 1 ? 's' : ''}</p>
        <p className="note">
          Each line represents the 7-day rolling average failure rate for a specific job.
        </p>
      </div>
    </div>
  );
}
