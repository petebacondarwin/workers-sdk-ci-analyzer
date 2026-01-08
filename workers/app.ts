import { createRequestHandler } from "react-router";

interface Env {
  CI_DATA_KV: KVNamespace;
  GITHUB_TOKEN?: string;
}

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  // @ts-expect-error - virtual module provided by build
  () => import("virtual:react-router/server-build"),
  // @ts-expect-error - MODE is set during build
  import.meta.env?.MODE || "production",
);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // API endpoints
    if (url.pathname.startsWith('/api/ci-data')) {
      return handleCIData(request, env);
    }
    
    if (url.pathname.startsWith('/api/workflow-runs')) {
      return handleWorkflowRuns(request, env);
    }
    
    if (url.pathname.startsWith('/api/job-logs')) {
      return handleJobLogs(request, env);
    }
    
    // Trigger manual refresh endpoint
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      return handleRefresh(request, env);
    }
    
    // Historical data endpoint
    if (url.pathname === '/api/history') {
      return handleHistory(request, env);
    }
    
    // All other requests go to React Router
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  
  async scheduled(event, env, ctx) {
    // Cron trigger - fetch and store CI data daily
    console.log('Scheduled job triggered at', new Date(event.scheduledTime).toISOString());
    
    try {
      await fetchAndStoreCIData(env);
      console.log('Successfully updated CI data in KV');
    } catch (error: any) {
      console.error('Failed to update CI data:', error.message);
    }
  }
} satisfies ExportedHandler<Env>;

// Function to fetch CI data from GitHub API and process it
async function fetchAndStoreCIData(env: Env, limit: number = 100): Promise<any> {
  const runsResponse = await fetch(
    `https://api.github.com/repos/cloudflare/workers-sdk/actions/runs?per_page=${limit}&branch=changeset-release/main`,
    {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Workers-SDK-CI-Analyzer',
        ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
      }
    }
  );
  
  if (!runsResponse.ok) {
    throw new Error(`GitHub API error: ${runsResponse.status}`);
  }
  
  const runsData = await runsResponse.json() as any;
  const runs = runsData.workflow_runs || [];
  
  const processedData: any = {
    jobStats: {},
    jobHistory: [],
    lastUpdated: new Date().toISOString(),
    totalRuns: runs.length
  };
  
  // Calculate 7-day window
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    for (const run of runs) {
      const jobsResponse = await fetch(run.jobs_url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Workers-SDK-CI-Analyzer',
          ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
        }
      });
      
      if (!jobsResponse.ok) continue;
      
      const jobsData = await jobsResponse.json() as any;
      const jobs = jobsData.jobs || [];
      const runCreatedAt = new Date(run.created_at);
      const isInLast7Days = runCreatedAt >= sevenDaysAgo;
      
      for (const job of jobs) {
        // Skip cancelled jobs
        if (job.conclusion === 'cancelled' || job.conclusion === 'skipped') {
          continue;
        }
        
        const jobName = job.name;
        
        // Initialize job stats if not exists
        if (!processedData.jobStats[jobName]) {
          processedData.jobStats[jobName] = {
            name: jobName,
            totalRuns: 0,
            failures: 0,
            successes: 0,
            failureRate: 0,
            last7Days: {
              totalRuns: 0,
              failures: 0,
              successes: 0,
              failureRate: 0
            },
            recentFailures: [],
            instances: []
          };
        }
        
        // Overall stats
        processedData.jobStats[jobName].totalRuns++;
        if (job.conclusion === 'failure') {
          processedData.jobStats[jobName].failures++;
          processedData.jobStats[jobName].recentFailures.push({
            runId: run.id,
            runNumber: run.run_number,
            runUrl: run.html_url,
            createdAt: run.created_at,
            jobUrl: job.html_url
          });
        } else if (job.conclusion === 'success') {
          processedData.jobStats[jobName].successes++;
        }
        
        // Last 7 days stats
        if (isInLast7Days) {
          processedData.jobStats[jobName].last7Days.totalRuns++;
          if (job.conclusion === 'failure') {
            processedData.jobStats[jobName].last7Days.failures++;
          } else if (job.conclusion === 'success') {
            processedData.jobStats[jobName].last7Days.successes++;
          }
        }
        
        // Track individual job instance
        processedData.jobStats[jobName].instances.push({
          jobId: job.id,
          runId: run.id,
          runNumber: run.run_number,
          conclusion: job.conclusion,
          createdAt: run.created_at,
          jobUrl: job.html_url,
          runUrl: run.html_url,
          startedAt: job.started_at,
          completedAt: job.completed_at
        });
        
        // Track job history for trend analysis
        processedData.jobHistory.push({
          jobName: jobName,
          conclusion: job.conclusion,
          createdAt: run.created_at,
          runNumber: run.run_number
        });
      }
    }
    
  // Calculate failure rates
  for (const jobName in processedData.jobStats) {
    const job = processedData.jobStats[jobName];
    
    // Overall failure rate
    const totalNonCancelled = job.failures + job.successes;
    job.failureRate = totalNonCancelled > 0 ? (job.failures / totalNonCancelled) * 100 : 0;
    
    // Last 7 days failure rate
    const total7Days = job.last7Days.failures + job.last7Days.successes;
    job.last7Days.failureRate = total7Days > 0 ? (job.last7Days.failures / total7Days) * 100 : 0;
    
    // Keep only the 5 most recent failures
    job.recentFailures = job.recentFailures.slice(-5);
    
    // Sort instances by date (newest first) and keep all
    job.instances.sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  
  // Store daily snapshot using date as key (YYYY-MM-DD)
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const dailyKey = `daily:${dateKey}`;
  
  // Create daily snapshot with timestamp and 7-day rolling average
  const dailySnapshot: any = {
    date: dateKey,
    timestamp: now.toISOString(),
    jobs: {} as Record<string, { 
      failureRate: number; 
      failures: number; 
      successes: number;
      last7DaysFailureRate: number;
      last7DaysFailures: number;
      last7DaysSuccesses: number;
    }>
  };
  
  for (const jobName in processedData.jobStats) {
    const job = processedData.jobStats[jobName];
    dailySnapshot.jobs[jobName] = {
      failureRate: job.failureRate,
      failures: job.failures,
      successes: job.successes,
      last7DaysFailureRate: job.last7Days.failureRate,
      last7DaysFailures: job.last7Days.failures,
      last7DaysSuccesses: job.last7Days.successes
    };
  }
  
  // Store daily snapshot with 6 month retention (180 days)
  await env.CI_DATA_KV.put(dailyKey, JSON.stringify(dailySnapshot), {
    expirationTtl: 60 * 60 * 24 * 180 // 180 days
  });
  
  // Update the date index to track all dates with data
  const indexKey = 'date-index';
  const indexData = await env.CI_DATA_KV.get(indexKey, 'json') as { dates: string[] } | null;
  const dates = indexData?.dates || [];
  
  // Add new date if not already in index
  if (!dates.includes(dateKey)) {
    dates.push(dateKey);
    dates.sort(); // Keep dates in chronological order
    
    // Keep only last 6 months (180 days)
    const recentDates = dates.slice(-180);
    
    await env.CI_DATA_KV.put(indexKey, JSON.stringify({ dates: recentDates }), {
      expirationTtl: 60 * 60 * 24 * 180
    });
  }
  
  // Store current data with instances for immediate access (cache for 1 hour)
  await env.CI_DATA_KV.put('ci-data', JSON.stringify(processedData), {
    expirationTtl: 60 * 60 // 1 hour cache
  });
  
  return processedData;
}

// Handle CI data API endpoint - read from KV or historical data
async function handleCIData(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    
    // If date range is specified, aggregate from historical snapshots
    if (startDate && endDate) {
      return await handleDateRangeQuery(env, new Date(startDate), new Date(endDate));
    }
    
    // Otherwise, return current data from KV
    const cachedData = await env.CI_DATA_KV.get('ci-data', 'text');
    
    if (cachedData) {
      return new Response(cachedData, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
          'X-Data-Source': 'kv-cache'
        }
      });
    }
    
    // Fallback: If KV is empty, fetch fresh data
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const processedData = await fetchAndStoreCIData(env, limit);
    
    return new Response(JSON.stringify(processedData), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
        'X-Data-Source': 'fresh-fetch'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// Handle date range queries by aggregating daily snapshots
async function handleDateRangeQuery(env: Env, startDate: Date, endDate: Date) {
  const indexKey = 'date-index';
  const indexData = await env.CI_DATA_KV.get(indexKey, 'json') as { dates: string[] } | null;
  
  if (!indexData || !indexData.dates || indexData.dates.length === 0) {
    return new Response(JSON.stringify({ 
      error: 'No historical data available',
      jobStats: {},
      jobHistory: [],
      lastUpdated: new Date().toISOString(),
      totalRuns: 0
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
        'X-Data-Source': 'historical-empty'
      }
    });
  }
  
  // Filter dates within date range
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  const filteredDates = indexData.dates.filter(date => {
    return date >= startDateStr && date <= endDateStr;
  });
  
  if (filteredDates.length === 0) {
    return new Response(JSON.stringify({ 
      error: 'No data available for the specified date range',
      jobStats: {},
      jobHistory: [],
      lastUpdated: new Date().toISOString(),
      totalRuns: 0,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
        'X-Data-Source': 'historical-no-data'
      }
    });
  }
  
  // Fetch all daily snapshots in range
  const dailyData = await Promise.all(
    filteredDates.map(async (date) => {
      const data = await env.CI_DATA_KV.get(`daily:${date}`, 'json');
      return data;
    })
  );
  
  // Aggregate data across days
  const jobAggregates: any = {};
  
  for (const dailySnapshot of dailyData) {
    if (!dailySnapshot) continue;
    const snapshotJobs = (dailySnapshot as any).jobs;
    
    for (const jobName in snapshotJobs) {
      if (!jobAggregates[jobName]) {
        jobAggregates[jobName] = {
          name: jobName,
          totalFailures: 0,
          totalSuccesses: 0,
          dataPoints: 0,
          recentFailures: []
        };
      }
      
      const jobData = snapshotJobs[jobName];
      jobAggregates[jobName].totalFailures += jobData.failures || 0;
      jobAggregates[jobName].totalSuccesses += jobData.successes || 0;
      jobAggregates[jobName].dataPoints++;
    }
  }
  
  // Calculate failure rates
  const jobStats: any = {};
  for (const jobName in jobAggregates) {
    const agg = jobAggregates[jobName];
    const total = agg.totalFailures + agg.totalSuccesses;
    const failureRate = total > 0 ? (agg.totalFailures / total) * 100 : 0;
    
    jobStats[jobName] = {
      name: jobName,
      totalRuns: total,
      failures: agg.totalFailures,
      successes: agg.totalSuccesses,
      failureRate: failureRate,
      last7Days: {
        totalRuns: total,
        failures: agg.totalFailures,
        successes: agg.totalSuccesses,
        failureRate: failureRate
      },
      recentFailures: [],
      instances: [] // Add empty instances array for date range queries
    };
  }
  
  return new Response(JSON.stringify({
    jobStats: jobStats,
    jobHistory: [],
    lastUpdated: new Date().toISOString(),
    totalRuns: filteredDates.length,
    dateRange: { start: startDate.toISOString(), end: endDate.toISOString() }
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'X-Data-Source': 'historical-aggregated'
    }
  });
}

// Handle manual refresh endpoint
async function handleRefresh(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const backfill = url.searchParams.get('backfill') === 'true';
    
    // Refresh current data
    const processedData = await fetchAndStoreCIData(env, limit);
    
    const result: any = {
      success: true,
      message: 'CI data refreshed successfully',
      lastUpdated: processedData.lastUpdated,
      totalRuns: processedData.totalRuns
    };
    
    // Check for gaps and backfill if requested
    if (backfill) {
      const gaps = await getMissingDateRanges(env);
      
      if (gaps.length > 0) {
        result.message += `. Found ${gaps.length} gap(s) in historical data. Backfilling...`;
        result.gaps = gaps.map(g => ({ start: g.start.toISOString(), end: g.end.toISOString() }));
        
        // Backfill gaps (limit to first gap to avoid timeout)
        const firstGap = gaps[0];
        await backfillHistoricalData(env, firstGap.start, firstGap.end);
        result.message += ` Backfilled data from ${firstGap.start.toISOString()} to ${firstGap.end.toISOString()}`;
      } else {
        result.message += '. No gaps found in historical data.';
      }
    }
    
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function handleWorkflowRuns(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    const response = await fetch(
      `https://api.github.com/repos/cloudflare/workers-sdk/actions/runs?per_page=${limit}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Workers-SDK-CI-Analyzer',
          ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
        }
      }
    );
    
    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function handleJobLogs(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get('job_id');
    
    if (!jobId) {
      return new Response(JSON.stringify({ error: 'job_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const response = await fetch(
      `https://api.github.com/repos/cloudflare/workers-sdk/actions/jobs/${jobId}/logs`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Workers-SDK-CI-Analyzer',
          ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
        }
      }
    );
    
    const logs = await response.text();
    
    return new Response(logs, {
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// Handle historical data endpoint
async function handleHistory(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const jobName = url.searchParams.get('job');
    
    // Get date index
    const indexKey = 'date-index';
    const indexData = await env.CI_DATA_KV.get(indexKey, 'json') as { dates: string[] } | null;
    
    if (!indexData || !indexData.dates || indexData.dates.length === 0) {
      return new Response(JSON.stringify({ 
        snapshots: [],
        message: 'No historical data available yet. Data will be collected daily.'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Get the most recent dates (up to requested days)
    const recentDates = indexData.dates.slice(-days);
    
    // Fetch all daily data
    const dailyData = await Promise.all(
      recentDates.map(async (date) => {
        const data = await env.CI_DATA_KV.get(`daily:${date}`, 'json');
        return data;
      })
    );
    
    // Filter out null results
    const validSnapshots = dailyData.filter(s => s !== null);
    
    if (jobName) {
      // Return data for specific job
      const jobHistory = validSnapshots.map((snapshot: any) => ({
        timestamp: snapshot.timestamp,
        date: snapshot.date,
        failureRate: snapshot.jobs[jobName]?.last7DaysFailureRate || 0,
        failures: snapshot.jobs[jobName]?.last7DaysFailures || 0,
        successes: snapshot.jobs[jobName]?.last7DaysSuccesses || 0
      }));
      
      return new Response(JSON.stringify({ 
        job: jobName,
        history: jobHistory
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
    
    // Return all snapshots
    return new Response(JSON.stringify({ 
      snapshots: validSnapshots,
      count: validSnapshots.length
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

// Helper function to get missing date ranges
async function getMissingDateRanges(env: Env): Promise<Array<{ start: Date; end: Date }>> {
  const indexKey = 'date-index';
  const indexData = await env.CI_DATA_KV.get(indexKey, 'json') as { dates: string[] } | null;
  
  if (!indexData || !indexData.dates || indexData.dates.length === 0) {
    // No data yet, backfill last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return [{ start, end }];
  }
  
  const dates = indexData.dates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime());
  const gaps: Array<{ start: Date; end: Date }> = [];
  
  // Check for gap from 6 months ago to first date
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  if (dates[0] > sixMonthsAgo) {
    gaps.push({ start: sixMonthsAgo, end: new Date(dates[0].getTime() - 24 * 60 * 60 * 1000) });
  }
  
  // Find gaps between dates (more than 1 day)
  for (let i = 0; i < dates.length - 1; i++) {
    const current = dates[i];
    const next = dates[i + 1];
    const daysDiff = (next.getTime() - current.getTime()) / (24 * 60 * 60 * 1000);
    
    if (daysDiff > 1) {
      gaps.push({ 
        start: new Date(current.getTime() + 24 * 60 * 60 * 1000), 
        end: new Date(next.getTime() - 24 * 60 * 60 * 1000)
      });
    }
  }
  
  return gaps;
}

// Backfill historical data for a specific date range
async function backfillHistoricalData(env: Env, startDate: Date, endDate: Date) {
  console.log(`Backfilling data from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  // For each day in the range, fetch workflow runs from that day
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const nextDay = new Date(currentDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    console.log(`Fetching data for ${dateStr}`);
    
    // Fetch workflow runs for this specific date
    const runsResponse = await fetch(
      `https://api.github.com/repos/cloudflare/workers-sdk/actions/runs?per_page=100&branch=changeset-release/main&created=${dateStr}..${nextDay.toISOString().split('T')[0]}`,
      {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Workers-SDK-CI-Analyzer',
          ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
        }
      }
    );
    
    if (!runsResponse.ok) {
      console.error(`Failed to fetch runs for ${dateStr}: ${runsResponse.status}`);
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }
    
    const runsData = await runsResponse.json() as any;
    const runs = runsData.workflow_runs || [];
    
    if (runs.length === 0) {
      console.log(`No runs found for ${dateStr}`);
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }
    
    // Process the data similar to fetchAndStoreCIData
    const jobStats: any = {};
    
    for (const run of runs) {
      const jobsResponse = await fetch(run.jobs_url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Workers-SDK-CI-Analyzer',
          ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
        }
      });
      
      if (!jobsResponse.ok) continue;
      
      const jobsData = await jobsResponse.json() as any;
      const jobs = jobsData.jobs || [];
      
      for (const job of jobs) {
        if (job.conclusion === 'cancelled' || job.conclusion === 'skipped') continue;
        
        const jobName = job.name;
        if (!jobStats[jobName]) {
          jobStats[jobName] = { failures: 0, successes: 0 };
        }
        
        if (job.conclusion === 'failure') {
          jobStats[jobName].failures++;
        } else if (job.conclusion === 'success') {
          jobStats[jobName].successes++;
        }
      }
    }
    
    // Calculate failure rates and store snapshot
    const snapshot: any = {
      timestamp: currentDate.toISOString(),
      date: dateStr,
      jobs: {}
    };
    
    for (const jobName in jobStats) {
      const stats = jobStats[jobName];
      const total = stats.failures + stats.successes;
      const failureRate = total > 0 ? (stats.failures / total) * 100 : 0;
      
      snapshot.jobs[jobName] = {
        failureRate: failureRate,
        failures: stats.failures,
        successes: stats.successes,
        last7DaysFailureRate: failureRate, // Same as overall for backfill
        last7DaysFailures: stats.failures,
        last7DaysSuccesses: stats.successes
      };
    }
    
    // Store the daily snapshot
    const dailyKey = `daily:${dateStr}`;
    await env.CI_DATA_KV.put(dailyKey, JSON.stringify(snapshot), {
      expirationTtl: 60 * 60 * 24 * 180
    });
    
    // Update date index
    const indexKey = 'date-index';
    const indexData = await env.CI_DATA_KV.get(indexKey, 'json') as { dates: string[] } | null;
    const dates = indexData?.dates || [];
    
    if (!dates.includes(dateStr)) {
      dates.push(dateStr);
      dates.sort();
      
      await env.CI_DATA_KV.put(indexKey, JSON.stringify({ dates: dates.slice(-180) }), {
        expirationTtl: 60 * 60 * 24 * 180
      });
    }
    
    console.log(`Stored daily snapshot for ${dateStr}`);
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Rate limiting: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
