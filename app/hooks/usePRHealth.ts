import { useState, useEffect, useCallback } from 'react';

export interface PRHealthItem {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  createdAt: string;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  labels: Array<{
    name: string;
    color: string;
  }>;
  commentCount: number;
  ageDays: number;
  staleDays: number;
}

export interface PRHealthStats {
  avgAgeDays: number;
  avgStaleDays: number;
  staleCount: number;      // > 14 days
  veryStaleCount: number;  // > 30 days
}

interface PRHealthResponse {
  prs: PRHealthItem[];
  total: number;
  stats: PRHealthStats;
  lastSync: string;
  message?: string;
  needsSync?: boolean;
  error?: string;
}

export type SortKey = 'stale' | 'age' | 'comments';
export type SortOrder = 'asc' | 'desc';

export function usePRHealth(
  stateFilter: 'open' | 'all' = 'open',
  sortBy: SortKey = 'stale',
  order: SortOrder = 'desc'
) {
  const [prs, setPrs] = useState<PRHealthItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PRHealthStats | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        state: stateFilter,
        sort: sortBy,
        order: order
      });
      
      const response = await fetch(`/api/pr-health?${params}`);
      const result = await response.json() as PRHealthResponse;
      
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
      
      setPrs(result.prs || []);
      setTotal(result.total || 0);
      setStats(result.stats || null);
      setLastSync(result.lastSync || null);
      setNeedsSync(false);
    } catch (err) {
      console.error('Error loading PR health data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [stateFilter, sortBy, order]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    prs,
    total,
    stats,
    lastSync,
    loading, 
    error,
    needsSync,
    refetch: fetchData 
  };
}
