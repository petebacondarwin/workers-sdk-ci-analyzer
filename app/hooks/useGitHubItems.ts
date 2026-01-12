import { useState, useEffect, useCallback } from 'react';

export interface OpenItemsDataPoint {
  date: string;
  openCount: number;
}

interface GitHubItemsResponse {
  type: 'issues' | 'prs';
  dateRange: { start: string; end: string };
  data: OpenItemsDataPoint[];
  totalItems: number;
  oldestDate: string;
  lastSync: string;
  error?: string;
  needsSync?: boolean;
}

export function useGitHubItems(
  type: 'issues' | 'prs',
  dateRange: { start: string; end: string }
) {
  const [data, setData] = useState<OpenItemsDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [oldestDate, setOldestDate] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [needsSync, setNeedsSync] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = `/api/github-items?type=${type}&startDate=${dateRange.start}&endDate=${dateRange.end}`;

      const response = await fetch(url);
      const result = await response.json() as GitHubItemsResponse;
      
      if (result.needsSync) {
        setNeedsSync(true);
        setError(result.error || 'Data needs to be synced');
        return;
      }
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setData(result.data || []);
      setTotalItems(result.totalItems || 0);
      setOldestDate(result.oldestDate || null);
      setLastSync(result.lastSync || null);
      setNeedsSync(false);
    } catch (err) {
      console.error('Error loading GitHub items:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [type, dateRange.start, dateRange.end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    loading, 
    error, 
    totalItems, 
    oldestDate, 
    lastSync, 
    needsSync,
    refetch: fetchData 
  };
}
