import { useState, useEffect, useCallback } from 'react';

export interface PRLabelStatsData {
  timestamps: number[];
  total: number[];
  labels: Record<string, number[]>;
}

interface PRLabelStatsResponse extends PRLabelStatsData {
  message?: string;
  error?: string;
}

export function usePRLabelStats(dateRange?: { start: string; end: string }) {
  const [data, setData] = useState<PRLabelStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = '/api/pr-label-stats';
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
      const result = await response.json() as PRLabelStatsResponse;
      
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
      console.error('Error loading PR label stats:', err);
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
