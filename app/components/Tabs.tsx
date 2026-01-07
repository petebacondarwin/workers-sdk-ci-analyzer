function Tabs({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'flaky', label: 'Flaky Tests' },
    { id: 'failures', label: 'Failure Rates' },
    { id: 'durations', label: 'Task Durations' },
    { id: 'trends', label: 'Trends' },
  ];

  return (
    <nav className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export default Tabs;
