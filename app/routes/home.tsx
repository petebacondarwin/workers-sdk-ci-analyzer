import { useState } from 'react';
import { useCIData } from '../hooks/useCIData';
import Header from '../components/Header';
import JobFailureRatesView from '../components/JobFailureRatesView';
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Workers SDK CI Analyzer - changeset-release/main" },
    { name: "description", content: "CI health dashboard for cloudflare/workers-sdk changeset-release/main branch" },
  ];
}

export default function Home({ params }: Route.ComponentProps) {
  const [runLimit, setRunLimit] = useState(100);
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

      <main>
        <div className="page-header">
          <h1>changeset-release/main CI Health</h1>
          <p className="subtitle">
            Monitoring CI jobs that run on Version Packages PRs. These jobs should never fail.
          </p>
        </div>

        {error && (
          <div className="error-message">
            Failed to load data: {error}. Please try again.
          </div>
        )}

        <JobFailureRatesView data={data} loading={loading} />
      </main>

      <footer>
        <p>Data sourced from GitHub Actions API • Branch: changeset-release/main</p>
        <p className="note">
          Note: Rate limits apply to unauthenticated requests (60 requests/hour). 
          For higher limits, configure a GitHub token.
        </p>
      </footer>
    </div>
  );
}
