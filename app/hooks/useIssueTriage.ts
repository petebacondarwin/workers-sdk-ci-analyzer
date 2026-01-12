import { useState, useEffect, useCallback } from 'react';

export interface TriageIssue {
  number: number;
  type: 'issue';
  title: string;
  state: 'open';
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  labels: Array<{
    name: string;
    color: string;
  }>;
}

interface IssueTriageResponse {
  untriaged: TriageIssue[];
  awaitingDev: TriageIssue[];
  totalUntriaged: number;
  totalAwaitingDev: number;
  lastSync: string;
  message?: string;
  needsSync?: boolean;
  error?: string;
}

export function useIssueTriage() {
  const [untriaged, setUntriaged] = useState<TriageIssue[]>([]);
  const [awaitingDev, setAwaitingDev] = useState<TriageIssue[]>([]);
  const [totalUntriaged, setTotalUntriaged] = useState(0);
  const [totalAwaitingDev, setTotalAwaitingDev] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/issue-triage');
      const result = await response.json() as IssueTriageResponse;
      
      if (result.needsSync) {
        setNeedsSync(true);
        setError(result.message || 'Data needs to be synced');
        return;
      }
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setUntriaged(result.untriaged || []);
      setAwaitingDev(result.awaitingDev || []);
      setTotalUntriaged(result.totalUntriaged || 0);
      setTotalAwaitingDev(result.totalAwaitingDev || 0);
      setLastSync(result.lastSync || null);
      setNeedsSync(false);
    } catch (err) {
      console.error('Error loading issue triage data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    untriaged,
    awaitingDev,
    totalUntriaged,
    totalAwaitingDev,
    lastSync,
    loading, 
    error,
    needsSync,
    refetch: fetchData 
  };
}
