interface DateRangeControlsProps {
  dateRange: { start: string; end: string };
  onDateRangeChange: (start: string, end: string) => void;
  showViewToggle?: boolean;
  view?: 'table' | 'chart';
  onViewChange?: (view: 'table' | 'chart') => void;
  minDate?: string; // Earliest selectable date (e.g., oldest item date)
}

export default function DateRangeControls({
  dateRange,
  onDateRangeChange,
  showViewToggle = false,
  view,
  onViewChange,
  minDate,
}: DateRangeControlsProps) {
  const handlePresetRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    
    // Clamp start date to minDate if specified
    let startStr = start.toISOString().split('T')[0];
    if (minDate && startStr < minDate) {
      startStr = minDate;
    }
    
    onDateRangeChange(
      startStr,
      end.toISOString().split('T')[0]
    );
  };

  // Handler for "All Time" button
  const handleAllTime = () => {
    if (minDate) {
      onDateRangeChange(
        minDate,
        new Date().toISOString().split('T')[0]
      );
    }
  };

  return (
    <div className="controls-bar">
      <div className="date-range-controls">
        <label>Date Range:</label>
        <div className="preset-buttons">
          <button onClick={() => handlePresetRange(7)}>Last 7 Days</button>
          <button onClick={() => handlePresetRange(30)}>Last 30 Days</button>
          <button onClick={() => handlePresetRange(90)}>Last 90 Days</button>
          <button onClick={() => handlePresetRange(180)}>Last 6 Months</button>
          <button onClick={() => handlePresetRange(365)}>Last Year</button>
          <button onClick={() => handlePresetRange(365 * 2)}>Last 2 Years</button>
          <button onClick={() => handlePresetRange(365 * 4)}>Last 4 Years</button>
          {minDate && (
            <button onClick={handleAllTime}>All Time</button>
          )}
        </div>
        <div className="custom-range">
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => onDateRangeChange(e.target.value, dateRange.end)}
            min={minDate}
            max={dateRange.end}
          />
          <span>to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => onDateRangeChange(dateRange.start, e.target.value)}
            min={dateRange.start}
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      {showViewToggle && onViewChange && (
        <div className="view-toggle">
          <button
            onClick={() => onViewChange('table')}
            className={view === 'table' ? 'active' : ''}
          >
            Table View
          </button>
          <button
            onClick={() => onViewChange('chart')}
            className={view === 'chart' ? 'active' : ''}
          >
            Chart View
          </button>
        </div>
      )}
    </div>
  );
}
