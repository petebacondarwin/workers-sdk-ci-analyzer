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
  ChartOptions,
  Filler
} from 'chart.js';

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

export interface OpenItemsData {
  date: string;
  openCount: number;
}

interface OpenItemsChartProps {
  data: OpenItemsData[];
  title: string;
  lineColor?: string;
  loading?: boolean;
  error?: string | null;
  dateRange: { start: string; end: string };
}

export default function OpenItemsChart({
  data,
  title,
  lineColor = 'rgb(246, 130, 31)', // Cloudflare orange
  loading,
  error,
  dateRange
}: OpenItemsChartProps) {
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading {title.toLowerCase()} data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        Failed to load data: {error}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>No data available for the selected date range.</p>
        <p className="note">Try selecting a different date range.</p>
      </div>
    );
  }

  // Generate all dates in the range for labels
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

  // Create a map of data by date for quick lookup
  const dataByDate = new Map<string, number>();
  data.forEach(item => {
    dataByDate.set(item.date, item.openCount);
  });

  const labels = generateDateRange(dateRange.start, dateRange.end);
  const chartValues = labels.map(date => dataByDate.get(date) ?? null);

  // Calculate statistics
  const validValues = chartValues.filter((v): v is number => v !== null);
  const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;
  const minValue = validValues.length > 0 ? Math.min(...validValues) : 0;
  const avgValue = validValues.length > 0
    ? validValues.reduce((a, b) => a + b, 0) / validValues.length
    : 0;
  const currentValue = validValues.length > 0 ? validValues[validValues.length - 1] : 0;

  const chartData = {
    labels,
    datasets: [
      {
        label: `Open ${title}`,
        data: chartValues,
        borderColor: lineColor,
        backgroundColor: lineColor.replace('rgb', 'rgba').replace(')', ', 0.1)'),
        borderWidth: 2,
        tension: 0.3,
        spanGaps: true,
        pointRadius: labels.length > 100 ? 0 : 3,
        pointHoverRadius: 6,
        fill: true
      }
    ]
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: `Open ${title} Over Time`,
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
          title: function (contexts) {
            return contexts[0]?.label || '';
          },
          label: function (context) {
            const value = context.parsed.y !== null ? context.parsed.y.toLocaleString() : 'N/A';
            return `Open ${title}: ${value}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: `Open ${title} Count`,
          color: '#ffffff',
          font: {
            size: 12
          }
        },
        ticks: {
          color: '#a0a0a0',
          callback: function (value) {
            return value.toLocaleString();
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
          minRotation: 45,
          // Show fewer labels for longer date ranges
          maxTicksLimit: 20
        },
        grid: {
          color: '#333333'
        }
      }
    }
  };

  return (
    <div className="open-items-chart-view">
      <div className="stats-summary">
        <div className="stat-card">
          <div className="stat-value">{currentValue.toLocaleString()}</div>
          <div className="stat-label">Currently Open</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{maxValue.toLocaleString()}</div>
          <div className="stat-label">Peak Open</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{minValue.toLocaleString()}</div>
          <div className="stat-label">Minimum Open</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{avgValue.toFixed(0)}</div>
          <div className="stat-label">Average Open</div>
        </div>
      </div>

      <div className="chart-container-wrapper">
        <div className="chart-container" style={{ height: '500px' }}>
          <Line data={chartData} options={options} />
        </div>
      </div>

      <div className="chart-info">
        <p>
          Showing {labels.length} days from {dateRange.start} to {dateRange.end}
        </p>
        <p>{data.length} data points available</p>
      </div>
    </div>
  );
}
