import { useState, useEffect, useCallback } from 'react';

export interface IssueLabelStatsData {
  timestamps: number[];
  total: number[];
  labels: Record<string, number[]>;
}

interface IssueLabelStatsResponse extends IssueLabelStatsData {
  message?: string;
  error?: string;
}

export function useIssueLabelStats(dateRange?: { start: string; end: string }) {
  const [data, setData] = useState<IssueLabelStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = '/api/issue-label-stats';
      const params = new URLSearchParams();
      
      if (dateRange?.start) {
        params.set('start', dateRange.start);
      }
      if (dateRange?.end) {
        params.set('end', dateRange.end);
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }

      const response = await fetch(url);
      const result = await response.json() as IssueLabelStatsResponse;
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setData({
        timestamps: result.timestamps || [],
        total: result.total || [],
        labels: result.labels || {}
      });
    } catch (err) {
      console.error('Error loading issue label stats:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [dateRange?.start, dateRange?.end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    loading, 
    error, 
    refetch: fetchData 
  };
}
