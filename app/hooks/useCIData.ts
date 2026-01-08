import { useState, useEffect, useCallback } from 'react';

interface JobStats {
  name: string;
  totalRuns: number;
  failures: number;
  successes: number;
  failureRate: number;
  last7Days: {
    totalRuns: number;
    failures: number;
    successes: number;
    failureRate: number;
  };
  recentFailures: Array<{
    runId: number;
    runNumber: number;
    runUrl: string;
    createdAt: string;
    jobUrl: string;
  }>;
}

interface CIData {
  jobStats: Record<string, JobStats>;
  jobHistory: Array<{
    jobName: string;
    conclusion: string;
    createdAt: string;
    runNumber: number;
  }>;
  lastUpdated: string;
  totalRuns: number;
}

export function useCIData(limit = 50) {
  const [data, setData] = useState<CIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/ci-data?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json() as CIData;
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, lastUpdated, refetch: fetchData };
}
