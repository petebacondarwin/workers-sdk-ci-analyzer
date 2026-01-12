import { useState, useMemo } from 'react';
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
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface IssueLabelChartProps {
  data: {
    timestamps: number[];
    total: number[];
    labels: Record<string, number[]>;
  };
  loading?: boolean;
  error?: string | null;
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
  '#a855f7', // purple
];

export default function IssueLabelChart({ data, loading, error }: IssueLabelChartProps) {
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set(['total']));
  const [searchQuery, setSearchQuery] = useState('');

  const allLabels = useMemo(() => {
    return ['total', ...Object.keys(data.labels).sort()];
  }, [data.labels]);

  // Filter labels based on search query
  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) return allLabels;
    const query = searchQuery.toLowerCase();
    return allLabels.filter((label) => label.toLowerCase().includes(query));
  }, [allLabels, searchQuery]);

  const toggleLabel = (label: string) => {
    const newSelected = new Set(selectedLabels);
    if (newSelected.has(label)) {
      newSelected.delete(label);
    } else {
      newSelected.add(label);
    }
    setSelectedLabels(newSelected);
  };

  const selectAll = () => {
    setSelectedLabels(new Set(filteredLabels));
  };

  const clearAll = () => {
    setSelectedLabels(new Set());
  };

  // Build Chart.js data
  const chartData = useMemo(() => {
    const datasets: any[] = [];

    // Add total line if selected
    if (selectedLabels.has('total')) {
      datasets.push({
        label: 'Total',
        data: data.timestamps.map((ts, i) => ({
          x: ts * 1000, // Convert to milliseconds
          y: data.total[i]
        })),
        borderColor: '#ffffff',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.1,
      });
    }

    // Add label lines
    let colorIndex = 0;
    Object.keys(data.labels)
      .filter((label) => selectedLabels.has(label))
      .forEach((label) => {
        datasets.push({
          label,
          data: data.timestamps.map((ts, i) => ({
            x: ts * 1000,
            y: data.labels[label][i] || 0
          })),
          borderColor: COLORS[colorIndex % COLORS.length],
          backgroundColor: `${COLORS[colorIndex % COLORS.length]}33`,
          borderWidth: 1.5,
          pointRadius: 1,
          tension: 0.1,
        });
        colorIndex++;
      });

    return { datasets };
  }, [data, selectedLabels]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#a0a0a0',
          usePointStyle: true,
          boxWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 26, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#a0a0a0',
        borderColor: '#333333',
        borderWidth: 1,
        callbacks: {
          title: (items: any[]) => {
            if (items.length > 0) {
              const date = new Date(items[0].raw.x);
              return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
            }
            return '';
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          displayFormats: {
            hour: 'MMM d, HH:mm',
            day: 'MMM d',
          },
        },
        grid: {
          color: '#333333',
        },
        ticks: {
          color: '#a0a0a0',
          maxRotation: 45,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#333333',
        },
        ticks: {
          color: '#a0a0a0',
        },
        title: {
          display: true,
          text: 'Count',
          color: '#a0a0a0',
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading issue label data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p>Error loading data: {error}</p>
      </div>
    );
  }

  if (data.timestamps.length === 0) {
    return (
      <div className="empty-state">
        <p>No issue data available yet.</p>
        <p>Click "Sync GitHub Data" to fetch issues from GitHub.</p>
      </div>
    );
  }

  return (
    <div className="issue-label-chart">
      <div className="chart-layout">
        {/* Left sidebar - Label filters */}
        <div className="label-filter-sidebar">
          <div className="filter-search">
            <input
              type="text"
              placeholder="Search labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="filter-search-clear"
                aria-label="Clear search"
              >
                x
              </button>
            )}
          </div>

          <div className="filter-buttons">
            <button onClick={selectAll} className="filter-btn filter-btn-primary">
              Select All
            </button>
            <button onClick={clearAll} className="filter-btn filter-btn-secondary">
              Clear
            </button>
          </div>

          <div className="filter-count">
            {selectedLabels.size} of {filteredLabels.length} selected
          </div>

          <div className="label-list">
            {filteredLabels.map((label, index) => {
              const isSelected = selectedLabels.has(label);
              const color = label === 'total' ? '#ffffff' : COLORS[(index - 1) % COLORS.length];
              return (
                <label
                  key={label}
                  className={`label-item ${isSelected ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleLabel(label)}
                  />
                  <span
                    className="label-color"
                    style={{ backgroundColor: color }}
                  ></span>
                  <span className="label-name" title={label}>
                    {label === 'total' ? 'Total' : label}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Right side - Chart */}
        <div className="chart-area">
          <div className="chart-container-wrapper">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>
    </div>
  );
}
