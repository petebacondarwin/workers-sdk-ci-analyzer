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
  ageDays: number;
  staleDays: number;
  // For awaiting issues: when the awaiting label was most recently applied
  awaitingLabelDate?: string | null;
  daysSinceAwaitingLabel?: number | null;
}

export interface TriageStats {
  avgAgeDays: number;
  avgStaleDays: number;
  staleCount: number;      // > 14 days
  veryStaleCount: number;  // > 30 days
}

interface IssueTriageResponse {
  untriaged: TriageIssue[];
  awaitingDev: TriageIssue[];
  awaitingCF: TriageIssue[];
  totalUntriaged: number;
  totalAwaitingDev: number;
  totalAwaitingCF: number;
  stats: {
    untriaged: TriageStats;
    awaitingDev: TriageStats;
    awaitingCF: TriageStats;
  };
  lastSync: string;
  message?: string;
  needsSync?: boolean;
  error?: string;
}

const defaultStats: TriageStats = {
  avgAgeDays: 0,
  avgStaleDays: 0,
  staleCount: 0,
  veryStaleCount: 0,
};

export function useIssueTriage() {
  const [untriaged, setUntriaged] = useState<TriageIssue[]>([]);
  const [awaitingDev, setAwaitingDev] = useState<TriageIssue[]>([]);
  const [awaitingCF, setAwaitingCF] = useState<TriageIssue[]>([]);
  const [totalUntriaged, setTotalUntriaged] = useState(0);
  const [totalAwaitingDev, setTotalAwaitingDev] = useState(0);
  const [totalAwaitingCF, setTotalAwaitingCF] = useState(0);
  const [stats, setStats] = useState<{
    untriaged: TriageStats;
    awaitingDev: TriageStats;
    awaitingCF: TriageStats;
  }>({
    untriaged: defaultStats,
    awaitingDev: defaultStats,
    awaitingCF: defaultStats,
  });
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
      setAwaitingCF(result.awaitingCF || []);
      setTotalUntriaged(result.totalUntriaged || 0);
      setTotalAwaitingDev(result.totalAwaitingDev || 0);
      setTotalAwaitingCF(result.totalAwaitingCF || 0);
      setStats(result.stats || {
        untriaged: defaultStats,
        awaitingDev: defaultStats,
        awaitingCF: defaultStats,
      });
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
    awaitingCF,
    totalUntriaged,
    totalAwaitingDev,
    totalAwaitingCF,
    stats,
    lastSync,
    loading, 
    error,
    needsSync,
    refetch: fetchData 
  };
}
