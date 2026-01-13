import { useState, useEffect, useCallback, useRef } from 'react';

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
  stale?: boolean;
  cachedAt?: string;
  analyzedAt?: string;
  error?: string;
}

export function useBusFactor() {
  const [data, setData] = useState<BusFactorData[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const isRefreshingRef = useRef(false);

  const fetchData = useCallback(async (forceRefresh: boolean = false) => {
    // If we already have data and this is a background refresh, use refreshing state
    const hasData = data.length > 0;
    
    if (forceRefresh && hasData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
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
      // Only set error if we don't have data to show
      if (!hasData) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [data.length]);

  // Initial fetch - check for stale data and refresh in background if needed
  useEffect(() => {
    const initialFetch = async () => {
      setLoading(true);
      setError(null);

      try {
        // First, get cached data (including stale)
        const response = await fetch('/api/bus-factor?stale-only');
        const result = await response.json() as BusFactorResponse;
        
        if (!response.ok) {
          throw new Error(result.error || `HTTP error! status: ${response.status}`);
        }
        
        if (result.error) {
          throw new Error(result.error);
        }
        
        // Show cached data immediately
        if (result.data && result.data.length > 0) {
          setData(result.data);
          setTeamMembers(result.teamMembers || []);
          setCached(result.cached || false);
          setLastUpdated(result.cachedAt || null);
          setLoading(false);
          
          // If data is stale, refresh in background
          if (result.stale && !isRefreshingRef.current) {
            isRefreshingRef.current = true;
            setRefreshing(true);
            
            try {
              const refreshResponse = await fetch('/api/bus-factor?refresh');
              const refreshResult = await refreshResponse.json() as BusFactorResponse;
              
              if (refreshResponse.ok && !refreshResult.error) {
                setData(refreshResult.data || []);
                setTeamMembers(refreshResult.teamMembers || []);
                setCached(refreshResult.cached || false);
                setLastUpdated(refreshResult.cachedAt || refreshResult.analyzedAt || null);
              }
            } catch (refreshErr) {
              console.error('Background refresh failed:', refreshErr);
              // Don't set error - we still have stale data to show
            } finally {
              setRefreshing(false);
              isRefreshingRef.current = false;
            }
          }
        } else {
          // No cached data, do a full fetch
          setLoading(false);
          await fetchData(true);
        }
      } catch (err) {
        console.error('Error loading bus factor data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    initialFetch();
  }, []); // Only run on mount

  return { 
    data, 
    teamMembers,
    loading, 
    refreshing,
    error, 
    lastUpdated,
    cached,
    refetch: fetchData,
    refresh: () => fetchData(true)
  };
}
