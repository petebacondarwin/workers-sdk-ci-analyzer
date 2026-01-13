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
import annotationPlugin from 'chartjs-plugin-annotation';
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
  TimeScale,
  annotationPlugin
);

interface LabelChartProps {
  data: {
    timestamps: number[];
    total: number[];
    labels: Record<string, number[]>;
  };
  loading?: boolean;
  error?: string | null;
  itemType?: 'issue' | 'pr';
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

export default function LabelChart({ data, loading, error, itemType = 'issue' }: LabelChartProps) {
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set(['total']));
  const [searchQuery, setSearchQuery] = useState('');

  const itemName = itemType === 'pr' ? 'PR' : 'issue';
  const itemNamePlural = itemType === 'pr' ? 'PRs' : 'issues';

  const allLabels = useMemo(() => {
    return ['total', ...Object.keys(data.labels).sort()];
  }, [data.labels]);

  // Calculate stats for the total
  const stats = useMemo(() => {
    if (data.total.length === 0) {
      return { min: 0, max: 0, avg: 0 };
    }
    const min = Math.min(...data.total);
    const max = Math.max(...data.total);
    const avg = data.total.reduce((sum, val) => sum + val, 0) / data.total.length;
    return { min, max, avg: Math.round(avg * 10) / 10 };
  }, [data.total]);

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

  const chartOptions: any = useMemo(() => ({
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
      annotation: selectedLabels.has('total') ? {
        annotations: {
          minLine: {
            type: 'line',
            yMin: stats.min,
            yMax: stats.min,
            borderColor: 'rgba(34, 197, 94, 0.6)', // green (success color)
            borderWidth: 1.5,
            borderDash: [4, 4],
            label: {
              display: true,
              content: `Min: ${stats.min}`,
              position: 'start',
              backgroundColor: 'rgba(34, 197, 94, 0.8)',
              color: '#ffffff',
              font: {
                size: 10,
              },
              padding: 3,
            },
          },
          averageLine: {
            type: 'line',
            yMin: stats.avg,
            yMax: stats.avg,
            borderColor: 'rgba(234, 179, 8, 0.6)', // yellow/amber (warning color)
            borderWidth: 1.5,
            borderDash: [6, 4],
            label: {
              display: true,
              content: `Avg: ${stats.avg}`,
              position: 'center',
              backgroundColor: 'rgba(234, 179, 8, 0.8)',
              color: '#000000',
              font: {
                size: 10,
              },
              padding: 3,
            },
          },
          maxLine: {
            type: 'line',
            yMin: stats.max,
            yMax: stats.max,
            borderColor: 'rgba(239, 68, 68, 0.6)', // red (danger color)
            borderWidth: 1.5,
            borderDash: [4, 4],
            label: {
              display: true,
              content: `Max: ${stats.max}`,
              position: 'end',
              backgroundColor: 'rgba(239, 68, 68, 0.8)',
              color: '#ffffff',
              font: {
                size: 10,
              },
              padding: 3,
            },
          },
        },
      } : {},
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
  }), [stats.avg, stats.min, stats.max, selectedLabels]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading {itemName} label data...</p>
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
        <p>No {itemName} data available yet.</p>
        <p>Click "Sync GitHub Data" to fetch {itemNamePlural} from GitHub.</p>
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
