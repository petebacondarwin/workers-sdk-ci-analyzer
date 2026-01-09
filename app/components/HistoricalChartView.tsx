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
  }>;
}

interface HistoricalChartViewProps {
  dateRange: { start: string; end: string };
}

export default function HistoricalChartView({ dateRange }: HistoricalChartViewProps) {
  const [snapshots, setSnapshots] = useState<HistoricalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/history?startDate=${dateRange.start}&endDate=${dateRange.end}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        const allSnapshots = result.snapshots || [];
        
        setSnapshots(allSnapshots);
        
        // Initialize selected jobs to all jobs on first load
        if (!initialized && allSnapshots.length > 0) {
          const allJobNames = new Set<string>();
          allSnapshots.forEach((snapshot: HistoricalSnapshot) => {
            Object.keys(snapshot.jobs).forEach(name => allJobNames.add(name));
          });
          setSelectedJobs(allJobNames);
          setInitialized(true);
        }
      } catch (err) {
        console.error('Error loading history:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    
    fetchHistory();
  }, [dateRange, initialized]);

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
  
  // Filter to only selected jobs
  const filteredJobNames = sortedJobNames.filter(name => selectedJobs.has(name));

  // Generate all dates in the range
  const generateDateRange = (start: string, end: string): string[] => {
    const dates: string[] = [];
    const currentDate = new Date(start);
    const endDate = new Date(end);
    
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
  };

  // Create a map of snapshots by date for quick lookup
  const snapshotsByDate = new Map<string, HistoricalSnapshot>();
  snapshots.forEach(snapshot => {
    snapshotsByDate.set(snapshot.date, snapshot);
  });

  // Prepare chart data with all dates in range
  const labels = generateDateRange(dateRange.start, dateRange.end);
  
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

  const datasets = filteredJobNames.map((jobName, index) => {
    const data = labels.map(date => {
      const snapshot = snapshotsByDate.get(date);
      if (!snapshot) return null;
      const jobData = snapshot.jobs[jobName];
      return jobData ? jobData.failureRate : null;
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
      pointHoverRadius: 6
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
      mode: 'nearest' as const,
      intersect: true,
    },
    plugins: {
      legend: {
        display: false // Hide legend since we have the filter panel
      },
      title: {
        display: true,
        text: 'Failure Rate Over Time',
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
          title: function(contexts) {
            return contexts[0]?.label || '';
          },
          label: function(context) {
            const jobName = context.dataset.label || '';
            const value = context.parsed.y !== null ? context.parsed.y.toFixed(1) + '%' : 'N/A';
            return `${jobName}: ${value}`;
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

  const toggleJob = (jobName: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(jobName)) {
      newSelected.delete(jobName);
    } else {
      newSelected.add(jobName);
    }
    setSelectedJobs(newSelected);
  };

  const selectAll = () => {
    setSelectedJobs(new Set(sortedJobNames));
  };

  const selectNone = () => {
    setSelectedJobs(new Set());
  };

  return (
    <div className="historical-chart-view">
      <div className="job-filter-section">
        <button 
          className="filter-toggle"
          onClick={() => setFilterExpanded(!filterExpanded)}
        >
          {filterExpanded ? '▼' : '▶'} Filter Jobs ({selectedJobs.size}/{sortedJobNames.length} selected)
        </button>
        
        {filterExpanded && (
          <div className="job-filter-panel">
            <div className="filter-actions">
              <button onClick={selectAll}>Select All</button>
              <button onClick={selectNone}>Select None</button>
            </div>
            <div className="job-checkboxes">
              {sortedJobNames.map((jobName, index) => (
                <label key={jobName} className="job-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedJobs.has(jobName)}
                    onChange={() => toggleJob(jobName)}
                  />
                  <span 
                    className="job-color-indicator" 
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  {jobName}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="chart-container-wrapper">
        <div className="chart-container" style={{ height: '600px' }}>
          <Line data={chartData} options={options} />
        </div>
      </div>

      <div className="chart-info">
        <p>
          Showing {labels.length} date{labels.length !== 1 ? 's' : ''} from{' '}
          {dateRange.start} to {dateRange.end} ({snapshots.length} with data)
        </p>
        <p>Displaying {filteredJobNames.length} of {sortedJobNames.length} jobs</p>
      </div>
    </div>
  );
}
