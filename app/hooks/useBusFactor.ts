import { useState, useEffect, useCallback } from 'react';

export interface BusFactorData {
  directory: string;
  busFactor: number;
  topContributors: Array<{
    login: string;
    commits: number;
    percentage: number;
  }>;
  teamMemberContributions: Record<string, number>;
}

interface BusFactorResponse {
  data: BusFactorData[];
  teamMembers: string[];
  cached: boolean;
  cachedAt?: string;
  analyzedAt?: string;
  error?: string;
}

export function useBusFactor() {
  const [data, setData] = useState<BusFactorData[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const fetchData = useCallback(async (forceRefresh: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const url = forceRefresh ? '/api/bus-factor?refresh' : '/api/bus-factor';
      const response = await fetch(url);
      const result = await response.json() as BusFactorResponse;
      
      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setData(result.data || []);
      setTeamMembers(result.teamMembers || []);
      setCached(result.cached || false);
      setLastUpdated(result.cachedAt || result.analyzedAt || null);
    } catch (err) {
      console.error('Error loading bus factor data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    teamMembers,
    loading, 
    error, 
    lastUpdated,
    cached,
    refetch: fetchData,
    refresh: () => fetchData(true)
  };
}
