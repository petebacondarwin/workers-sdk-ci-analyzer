import { useState } from 'react';
import { useCIData } from '../hooks/useCIData';
import Header from '../components/Header';
import Tabs from '../components/Tabs';
import FlakyTestsView from '../components/FlakyTestsView';
import FailureRatesView from '../components/FailureRatesView';
import DurationsView from '../components/DurationsView';
import TrendsView from '../components/TrendsView';
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workers SDK CI Analyzer" },
    { name: "description", content: "CI health dashboard for cloudflare/workers-sdk" },
  ];
}

export default function Home({ params }: Route.ComponentProps) {
  const [activeTab, setActiveTab] = useState('flaky');
  const [runLimit, setRunLimit] = useState(50);
  const { data, loading, error, lastUpdated, refetch } = useCIData(runLimit);

  const handleRefresh = () => {
    refetch();
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRunLimit(parseInt(e.target.value));
  };

  return (
    <div className="container">
      <Header
        loading={loading}
        lastUpdated={lastUpdated}
        runLimit={runLimit}
        onLimitChange={handleLimitChange}
        onRefresh={handleRefresh}
      />

      <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

      <main>
        {error && (
          <div className="error-message">
            Failed to load data: {error}. Please try again.
          </div>
        )}

        {activeTab === 'flaky' && <FlakyTestsView data={data} loading={loading} />}
        {activeTab === 'failures' && <FailureRatesView data={data} loading={loading} />}
        {activeTab === 'durations' && <DurationsView data={data} loading={loading} />}
        {activeTab === 'trends' && <TrendsView data={data} loading={loading} />}
      </main>

      <footer>
        <p>Data sourced from GitHub Actions API</p>
        <p className="note">
          Note: Rate limits apply to unauthenticated requests (60 requests/hour). 
          For higher limits, configure a GitHub token.
        </p>
      </footer>
    </div>
  );
}
