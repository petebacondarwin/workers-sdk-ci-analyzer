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
    
    // GitHub issues/PRs endpoint
    if (url.pathname === '/api/github-items') {
      return handleGitHubItems(request, env);
    }
    
    // GitHub items sync endpoint
    if (url.pathname === '/api/sync-github-items') {
      return handleSyncGitHubItems(request, env);
    }
    
    // Issue label statistics endpoint
    if (url.pathname === '/api/issue-label-stats') {
      return handleIssueLabelStats(request, env);
    }
    
    // Bus factor endpoint
    if (url.pathname === '/api/bus-factor') {
      return handleBusFactor(request, env);
    }
    
    // Issue triage endpoint
    if (url.pathname === '/api/issue-triage') {
      return handleIssueTriage(request, env);
    }
    
    // PR health endpoint
    if (url.pathname === '/api/pr-health') {
      return handlePRHealth(request, env);
    }
    
    // All other requests go to React Router
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
  
  async scheduled(event, env, ctx) {
    const scheduledTime = new Date(event.scheduledTime);
    const hour = scheduledTime.getUTCHours();
    console.log(`Scheduled job triggered at ${scheduledTime.toISOString()} (hour: ${hour} UTC)`);
    
    // CI data sync only at 6 AM UTC (once daily)
    if (hour === 6) {
      try {
        await fetchAndStoreCIData(env);
        console.log('Successfully updated CI data in KV');
      } catch (error: any) {
        console.error('Failed to update CI data:', error.message);
      }
    }
    
    // GitHub items sync every hour
    try {
      const result = await syncGitHubItems(env, false);
      console.log(`Successfully synced GitHub items: ${result.newItems} new, ${result.updatedItems} updated, ${result.totalItems} total`);
    } catch (error: any) {
      console.error('Failed to sync GitHub items:', error.message);
    }
  }
} satisfies ExportedHandler<Env>;

// Function to fetch CI data from GitHub API and process it
async function fetchAndStoreCIData(env: Env, limit: number = 100): Promise<any> {
  console.log("Fetching CI data from GitHub API with limit:", limit, env.GITHUB_TOKEN ? "(with token)" : "(no token)");
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
    throw new Error(`GitHub API error: ${runsResponse.status} (${runsResponse.statusText}) - ${await runsResponse.text()} - ${[...runsResponse.headers.entries()].map(([k,v])=>`${k}: ${v}`).join(', ')}`);
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
    
    // Fetch jobs in parallel batches of 8 for better performance
    const batchSize = 8;
    for (let i = 0; i < runs.length; i += batchSize) {
      const batch = runs.slice(i, i + batchSize);
      
      const jobsResponses = await Promise.all(
        batch.map((run: any) => 
          fetch(run.jobs_url, {
            headers: {
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'Workers-SDK-CI-Analyzer',
              ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
            }
          }).then(res => res.ok ? res.json() : null).catch(() => null)
        )
      );
      
      // Process each run's jobs
      for (let j = 0; j < batch.length; j++) {
        const run = batch[j];
        const jobsData = jobsResponses[j];
        
        if (!jobsData) continue;
        
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
      instances: any[];
      recentFailures: any[];
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
      last7DaysSuccesses: job.last7Days.successes,
      instances: job.instances,
      recentFailures: job.recentFailures
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
          recentFailures: [],
          instances: []
        };
      }
      
      const jobData = snapshotJobs[jobName];
      jobAggregates[jobName].totalFailures += jobData.failures || 0;
      jobAggregates[jobName].totalSuccesses += jobData.successes || 0;
      jobAggregates[jobName].dataPoints++;
      
      // Collect instances from this snapshot
      if (jobData.instances && Array.isArray(jobData.instances)) {
        jobAggregates[jobName].instances.push(...jobData.instances);
      }
      
      // Collect recent failures
      if (jobData.recentFailures && Array.isArray(jobData.recentFailures)) {
        jobAggregates[jobName].recentFailures.push(...jobData.recentFailures);
      }
    }
  }
  
  // Calculate failure rates
  const jobStats: any = {};
  for (const jobName in jobAggregates) {
    const agg = jobAggregates[jobName];
    const total = agg.totalFailures + agg.totalSuccesses;
    const failureRate = total > 0 ? (agg.totalFailures / total) * 100 : 0;
    
    // Sort instances by date (newest first) and deduplicate by jobId
    const uniqueInstances = Array.from(
      new Map(agg.instances.map((inst: any) => [inst.jobId, inst])).values()
    ).sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Sort and deduplicate recent failures, keep top 5
    const uniqueFailures = Array.from(
      new Map(agg.recentFailures.map((fail: any) => [fail.runId, fail])).values()
    ).sort((a: any, b: any) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ).slice(0, 5);
    
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
      recentFailures: uniqueFailures,
      instances: uniqueInstances
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
        result.message += `. Found ${gaps.length} gap(s) in historical data. Backfilling all gaps...`;
        result.gaps = gaps.map(g => ({ start: g.start.toISOString(), end: g.end.toISOString() }));
        
        // Backfill all gaps
        for (const gap of gaps) {
          await backfillHistoricalData(env, gap.start, gap.end);
        }
        result.message += ` Backfilled ${gaps.length} gap(s).`;
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
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
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
    
    // Filter dates by date range if provided, otherwise use days
    let recentDates: string[];
    if (startDate && endDate) {
      const start = startDate.split('T')[0]; // Normalize to YYYY-MM-DD
      const end = endDate.split('T')[0];
      recentDates = indexData.dates.filter(date => date >= start && date <= end);
    } else {
      // Get the most recent dates (up to requested days)
      recentDates = indexData.dates.slice(-days);
    }
    
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

// Helper function to add a date to the index
async function addDateToIndex(env: Env, dateStr: string): Promise<void> {
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
  
  // Check for gap from last date to today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDate = dates[dates.length - 1];
  const daysSinceLastDate = (today.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000);
  
  if (daysSinceLastDate > 1) {
    gaps.push({
      start: new Date(lastDate.getTime() + 24 * 60 * 60 * 1000),
      end: new Date(today.getTime() - 24 * 60 * 60 * 1000) // yesterday
    });
  }

  console.log('Identified gaps in historical data:', gaps.map(g => ({ 
    start: g.start.toISOString().split('T')[0], 
    end: g.end.toISOString().split('T')[0] 
  })));
  
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
      // Still record this date in the index so we don't try to backfill it again
      await addDateToIndex(env, dateStr);
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }
    
    // Process the data similar to fetchAndStoreCIData
    const jobStats: any = {};
    
    // Fetch jobs in parallel batches of 8 for better performance
    const batchSize = 8;
    for (let i = 0; i < runs.length; i += batchSize) {
      const batch = runs.slice(i, i + batchSize);
      
      const jobsResponses = await Promise.all(
        batch.map((run: any) => 
          fetch(run.jobs_url, {
            headers: {
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'Workers-SDK-CI-Analyzer',
              ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
            }
          }).then(res => res.ok ? res.json() : null).catch(() => null)
        )
      );
      
      // Process each run's jobs
      for (let j = 0; j < batch.length; j++) {
        const run = batch[j];
        const jobsData = jobsResponses[j];
        
        if (!jobsData) continue;
        
        const jobs = jobsData.jobs || [];
        
        for (const job of jobs) {
          if (job.conclusion === 'cancelled' || job.conclusion === 'skipped') continue;
          
          const jobName = job.name;
          if (!jobStats[jobName]) {
            jobStats[jobName] = { 
              failures: 0, 
              successes: 0,
              instances: [],
              recentFailures: []
            };
          }
          
          if (job.conclusion === 'failure') {
            jobStats[jobName].failures++;
            jobStats[jobName].recentFailures.push({
              runId: run.id,
              runNumber: run.run_number,
              runUrl: run.html_url,
              createdAt: run.created_at,
              jobUrl: job.html_url
            });
          } else if (job.conclusion === 'success') {
            jobStats[jobName].successes++;
          }
          
          // Track individual job instance
          jobStats[jobName].instances.push({
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
      
      // Sort instances by date (newest first)
      stats.instances.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      // Keep only last 5 failures
      const recentFailures = stats.recentFailures.slice(-5);
      
      snapshot.jobs[jobName] = {
        failureRate: failureRate,
        failures: stats.failures,
        successes: stats.successes,
        last7DaysFailureRate: failureRate, // Same as overall for backfill
        last7DaysFailures: stats.failures,
        last7DaysSuccesses: stats.successes,
        instances: stats.instances,
        recentFailures: recentFailures
      };
    }
    
    // Store the daily snapshot
    const dailyKey = `daily:${dateStr}`;
    await env.CI_DATA_KV.put(dailyKey, JSON.stringify(snapshot), {
      expirationTtl: 60 * 60 * 24 * 180
    });
    
    // Update date index
    await addDateToIndex(env, dateStr);
    
    console.log(`Stored daily snapshot for ${dateStr}`);
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    
    // Rate limiting: small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// ============================================================================
// GitHub Items (Issues/PRs) - Types, Storage, and Sync
// ============================================================================

// Constants
const GITHUB_ITEMS_KV_KEY = 'github-items';
const GITHUB_ITEMS_META_KV_KEY = 'github-items-meta';
const BUS_FACTOR_CACHE_KV_KEY = 'bus-factor-cache';
const SYNC_OVERLAP_MINUTES = 10; // Look back 10 minutes past lastSync to avoid race conditions

// Bus factor types
interface BusFactorResult {
  directory: string;
  busFactor: number;
  topContributors: Array<{
    login: string;
    commits: number;
    percentage: number;
  }>;
  teamMemberContributions: Record<string, number>;
}

// Monitored directories for bus factor analysis
const MONITORED_DIRECTORIES = [
  'packages/chrome-devtools-patches',
  'packages/vite-plugin-cloudflare',
  'packages/vite-plugin-cloudflare/src',
  'packages/wrangler/src/auth',
  'packages/wrangler/src/deploy',
  'packages/wrangler/src/dev',
  'packages/wrangler/src/pages',
  'packages/wrangler/src/d1',
  'packages/wrangler/src/kv',
  'packages/wrangler/src/r2',
  'packages/wrangler/src/queues',
  'packages/wrangler/src/vectorize',
  'packages/wrangler/src/hyperdrive',
  'packages/wrangler/src/worker',
  'packages/wrangler/src/api',
  'packages/wrangler/src/config',
  'packages/wrangler/src/init',
  'packages/wrangler/src/publish',
  'packages/wrangler/src/secret',
  'packages/wrangler/src/tail',
  'packages/wrangler/src/metrics',
] as const;

// Team members for bus factor analysis
const WRANGLER_TEAM_MEMBERS = [
  'penalosa',
  'jamesopstad',
  'dario-piotrowicz',
  'emily-shen',
  'edmundhung',
  'NuroDev',
  'petebacondarwin',
  'ascorbic',
  'vicb',
] as const;

// Enhanced GitHub item stored in KV
interface GitHubItem {
  number: number;
  type: 'issue' | 'pr';
  title: string;
  state: 'open' | 'closed' | 'merged';
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
  commentCount: number;
}

// Metadata stored alongside items
interface GitHubItemsMeta {
  lastSync: string;
  highestNumber: number;
  oldestDate: string;
  issueCount: number;
  prCount: number;
}

// Raw GraphQL response types
interface GitHubGraphQLIssueNode {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  stateReason: 'COMPLETED' | 'NOT_PLANNED' | 'REOPENED' | null;
  createdAt: string;
  closedAt: string | null;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  labels: {
    nodes: Array<{
      name: string;
      color: string;
    }>;
  };
  comments: {
    totalCount: number;
  };
}

interface GitHubGraphQLPRNode {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  merged: boolean;
  createdAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
  } | null;
  labels: {
    nodes: Array<{
      name: string;
      color: string;
    }>;
  };
  comments: {
    totalCount: number;
  };
}

interface GitHubIssuesGraphQLResponse {
  data?: {
    repository?: {
      issues?: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GitHubGraphQLIssueNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

interface GitHubPRsGraphQLResponse {
  data?: {
    repository?: {
      pullRequests?: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GitHubGraphQLPRNode[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

// ============================================================================
// KV Storage Functions
// ============================================================================

async function loadGitHubItemsFromKV(env: Env): Promise<Record<number, GitHubItem>> {
  const data = await env.CI_DATA_KV.get(GITHUB_ITEMS_KV_KEY, 'json');
  return (data as Record<number, GitHubItem>) || {};
}

async function loadGitHubItemsMetaFromKV(env: Env): Promise<GitHubItemsMeta | null> {
  const data = await env.CI_DATA_KV.get(GITHUB_ITEMS_META_KV_KEY, 'json');
  return data as GitHubItemsMeta | null;
}

async function saveGitHubItemsToKV(
  env: Env,
  items: Record<number, GitHubItem>,
  meta: GitHubItemsMeta
): Promise<void> {
  await Promise.all([
    env.CI_DATA_KV.put(GITHUB_ITEMS_KV_KEY, JSON.stringify(items)),
    env.CI_DATA_KV.put(GITHUB_ITEMS_META_KV_KEY, JSON.stringify(meta))
  ]);
}

async function deleteGitHubItemsFromKV(env: Env): Promise<void> {
  await Promise.all([
    env.CI_DATA_KV.delete(GITHUB_ITEMS_KV_KEY),
    env.CI_DATA_KV.delete(GITHUB_ITEMS_META_KV_KEY)
  ]);
}

// ============================================================================
// GraphQL Fetch Functions
// ============================================================================

function getIssuesQuery(filterBySince?: string): string {
  const filterClause = filterBySince 
    ? `filterBy: { since: "${filterBySince}" }` 
    : '';
  
  return `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        issues(
          first: 100
          after: $cursor
          ${filterClause}
          orderBy: { field: CREATED_AT, direction: ASC }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            state
            stateReason
            createdAt
            closedAt
            updatedAt
            author {
              login
              avatarUrl
            }
            labels(first: 20) {
              nodes {
                name
                color
              }
            }
            comments {
              totalCount
            }
          }
        }
      }
    }
  `;
}

function getPRsQuery(): string {
  return `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          first: 100
          after: $cursor
          orderBy: { field: CREATED_AT, direction: ASC }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            state
            merged
            createdAt
            closedAt
            mergedAt
            updatedAt
            author {
              login
              avatarUrl
            }
            labels(first: 20) {
              nodes {
                name
                color
              }
            }
            comments {
              totalCount
            }
          }
        }
      }
    }
  `;
}

// For fetching recently updated PRs (PRs don't support filterBy.since, so we use UPDATED_AT ordering)
function getPRsUpdatedQuery(): string {
  return `
    query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          first: 100
          after: $cursor
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            state
            merged
            createdAt
            closedAt
            mergedAt
            updatedAt
            author {
              login
              avatarUrl
            }
            labels(first: 20) {
              nodes {
                name
                color
              }
            }
            comments {
              totalCount
            }
          }
        }
      }
    }
  `;
}

function transformIssueNode(node: GitHubGraphQLIssueNode): GitHubItem {
  return {
    number: node.number,
    type: 'issue',
    title: node.title,
    state: node.state === 'OPEN' ? 'open' : 'closed',
    createdAt: node.createdAt,
    closedAt: node.closedAt,
    updatedAt: node.updatedAt,
    author: node.author,
    labels: node.labels.nodes,
    commentCount: node.comments.totalCount
  };
}

function transformPRNode(node: GitHubGraphQLPRNode): GitHubItem {
  let state: 'open' | 'closed' | 'merged';
  if (node.merged) {
    state = 'merged';
  } else if (node.state === 'OPEN') {
    state = 'open';
  } else {
    state = 'closed';
  }
  
  return {
    number: node.number,
    type: 'pr',
    title: node.title,
    state,
    createdAt: node.createdAt,
    closedAt: node.closedAt || node.mergedAt,
    updatedAt: node.updatedAt,
    author: node.author,
    labels: node.labels.nodes,
    commentCount: node.comments.totalCount
  };
}

async function fetchIssuesGraphQL(
  env: Env,
  query: string,
  cursor: string | null
): Promise<GitHubIssuesGraphQLResponse> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Workers-SDK-CI-Analyzer'
    },
    body: JSON.stringify({
      query,
      variables: {
        owner: 'cloudflare',
        repo: 'workers-sdk',
        cursor
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API error: ${response.status}`);
  }

  const result = await response.json() as GitHubIssuesGraphQLResponse;

  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
  }

  return result;
}

async function fetchPRsGraphQL(
  env: Env,
  query: string,
  cursor: string | null
): Promise<GitHubPRsGraphQLResponse> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Workers-SDK-CI-Analyzer'
    },
    body: JSON.stringify({
      query,
      variables: {
        owner: 'cloudflare',
        repo: 'workers-sdk',
        cursor
      }
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API error: ${response.status}`);
  }

  const result = await response.json() as GitHubPRsGraphQLResponse;

  if (result.errors && result.errors.length > 0) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: { message: string }) => e.message).join(', ')}`);
  }

  return result;
}

// ============================================================================
// Sync Functions
// ============================================================================

interface SyncResult {
  newItems: number;
  updatedItems: number;
  totalItems: number;
  issueCount: number;
  prCount: number;
  oldestDate: string;
  syncDuration: number;
}

async function syncGitHubItems(env: Env, force: boolean): Promise<SyncResult> {
  const startTime = Date.now();
  
  if (!env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required for syncing');
  }

  let items: Record<number, GitHubItem>;
  let meta: GitHubItemsMeta | null;
  let newItemCount = 0;
  let updatedItemCount = 0;

  if (force) {
    // Force sync: delete everything and start fresh
    console.log('Force sync: deleting existing data...');
    await deleteGitHubItemsFromKV(env);
    items = {};
    meta = null;
  } else {
    // Load existing data
    items = await loadGitHubItemsFromKV(env);
    meta = await loadGitHubItemsMetaFromKV(env);
  }

  const existingCount = Object.keys(items).length;
  console.log(`Starting sync. Existing items: ${existingCount}`);

  // If no metadata or force sync, do full sync
  if (!meta || force) {
    console.log('Performing full sync...');
    const result = await performFullSync(env, items);
    newItemCount = result.newItems;
  } else {
    // Incremental sync
    console.log(`Performing incremental sync. Last sync: ${meta.lastSync}, Highest number: ${meta.highestNumber}`);
    
    // 1. Fetch new items (created after highest number we have)
    const newResult = await fetchNewItems(env, items, meta.highestNumber);
    newItemCount = newResult.newItems;
    
    // 2. Fetch recently updated items (since lastSync - overlap buffer)
    const sinceDate = new Date(new Date(meta.lastSync).getTime() - SYNC_OVERLAP_MINUTES * 60 * 1000);
    const updateResult = await fetchUpdatedItems(env, items, sinceDate);
    updatedItemCount = updateResult.updatedItems;
  }

  // Calculate new metadata
  const itemValues = Object.values(items);
  const issueCount = itemValues.filter(i => i.type === 'issue').length;
  const prCount = itemValues.filter(i => i.type === 'pr').length;
  const highestNumber = Math.max(0, ...Object.keys(items).map(Number));
  const oldestDate = itemValues.length > 0
    ? itemValues.reduce((min, item) => item.createdAt < min ? item.createdAt : min, itemValues[0].createdAt).split('T')[0]
    : new Date().toISOString().split('T')[0];

  const newMeta: GitHubItemsMeta = {
    lastSync: new Date().toISOString(),
    highestNumber,
    oldestDate,
    issueCount,
    prCount
  };

  // Save to KV
  await saveGitHubItemsToKV(env, items, newMeta);

  const syncDuration = Date.now() - startTime;
  console.log(`Sync complete. New: ${newItemCount}, Updated: ${updatedItemCount}, Total: ${itemValues.length}, Duration: ${syncDuration}ms`);

  return {
    newItems: newItemCount,
    updatedItems: updatedItemCount,
    totalItems: itemValues.length,
    issueCount,
    prCount,
    oldestDate,
    syncDuration
  };
}

async function performFullSync(
  env: Env,
  items: Record<number, GitHubItem>
): Promise<{ newItems: number }> {
  let newItems = 0;

  // Fetch all issues
  console.log('Fetching all issues...');
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;

  while (hasNextPage) {
    const result = await fetchIssuesGraphQL(env, getIssuesQuery(), cursor);
    const issuesData = result.data?.repository?.issues;
    
    if (!issuesData) break;

    for (const node of issuesData.nodes) {
      if (!items[node.number]) {
        newItems++;
      }
      items[node.number] = transformIssueNode(node);
    }

    hasNextPage = issuesData.pageInfo.hasNextPage;
    cursor = issuesData.pageInfo.endCursor;
    pageCount++;

    if (pageCount % 10 === 0) {
      console.log(`Issues: ${pageCount} pages, ${Object.keys(items).length} items`);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log(`Fetched ${pageCount} pages of issues`);

  // Fetch all PRs
  console.log('Fetching all PRs...');
  cursor = null;
  hasNextPage = true;
  pageCount = 0;

  while (hasNextPage) {
    const result = await fetchPRsGraphQL(env, getPRsQuery(), cursor);
    const prsData = result.data?.repository?.pullRequests;
    
    if (!prsData) break;

    for (const node of prsData.nodes) {
      if (!items[node.number]) {
        newItems++;
      }
      items[node.number] = transformPRNode(node);
    }

    hasNextPage = prsData.pageInfo.hasNextPage;
    cursor = prsData.pageInfo.endCursor;
    pageCount++;

    if (pageCount % 10 === 0) {
      console.log(`PRs: ${pageCount} pages, ${Object.keys(items).length} items`);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }
  console.log(`Fetched ${pageCount} pages of PRs`);

  return { newItems };
}

async function fetchNewItems(
  env: Env,
  items: Record<number, GitHubItem>,
  highestNumber: number
): Promise<{ newItems: number }> {
  let newItems = 0;

  // Fetch new issues (we fetch all and skip ones we have, since we can't filter by number > X)
  // Use CREATED_AT DESC to get newest first, stop when we hit known items
  console.log(`Fetching new issues (after #${highestNumber})...`);
  let cursor: string | null = null;
  let hasNextPage = true;
  let consecutiveKnown = 0;
  const STOP_THRESHOLD = 100; // Stop after seeing 100 consecutive known items

  while (hasNextPage && consecutiveKnown < STOP_THRESHOLD) {
    const result = await fetchIssuesGraphQL(env, getIssuesQuery(), cursor);
    const issuesData = result.data?.repository?.issues;
    
    if (!issuesData) break;

    for (const node of issuesData.nodes) {
      if (items[node.number]) {
        consecutiveKnown++;
      } else {
        consecutiveKnown = 0;
        newItems++;
        items[node.number] = transformIssueNode(node);
      }
    }

    hasNextPage = issuesData.pageInfo.hasNextPage;
    cursor = issuesData.pageInfo.endCursor;

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Fetch new PRs
  console.log(`Fetching new PRs (after #${highestNumber})...`);
  cursor = null;
  hasNextPage = true;
  consecutiveKnown = 0;

  while (hasNextPage && consecutiveKnown < STOP_THRESHOLD) {
    const result = await fetchPRsGraphQL(env, getPRsQuery(), cursor);
    const prsData = result.data?.repository?.pullRequests;
    
    if (!prsData) break;

    for (const node of prsData.nodes) {
      if (items[node.number]) {
        consecutiveKnown++;
      } else {
        consecutiveKnown = 0;
        newItems++;
        items[node.number] = transformPRNode(node);
      }
    }

    hasNextPage = prsData.pageInfo.hasNextPage;
    cursor = prsData.pageInfo.endCursor;

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`Found ${newItems} new items`);
  return { newItems };
}

async function fetchUpdatedItems(
  env: Env,
  items: Record<number, GitHubItem>,
  since: Date
): Promise<{ updatedItems: number }> {
  let updatedItems = 0;
  const sinceISO = since.toISOString();

  // Fetch recently updated issues
  console.log(`Fetching issues updated since ${sinceISO}...`);
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await fetchIssuesGraphQL(env, getIssuesQuery(sinceISO), cursor);
    const issuesData = result.data?.repository?.issues;
    
    if (!issuesData) break;

    for (const node of issuesData.nodes) {
      const existing = items[node.number];
      if (existing && existing.updatedAt !== node.updatedAt) {
        updatedItems++;
      }
      items[node.number] = transformIssueNode(node);
    }

    hasNextPage = issuesData.pageInfo.hasNextPage;
    cursor = issuesData.pageInfo.endCursor;

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Fetch recently updated PRs (PRs don't support filterBy.since, so we order by UPDATED_AT DESC
  // and stop when we hit items older than our since date)
  console.log(`Fetching PRs updated since ${sinceISO}...`);
  cursor = null;
  hasNextPage = true;
  let foundOlder = false;

  while (hasNextPage && !foundOlder) {
    const result = await fetchPRsGraphQL(env, getPRsUpdatedQuery(), cursor);
    const prsData = result.data?.repository?.pullRequests;
    
    if (!prsData) break;

    for (const node of prsData.nodes) {
      if (new Date(node.updatedAt) < since) {
        foundOlder = true;
        break;
      }
      
      const existing = items[node.number];
      if (existing && existing.updatedAt !== node.updatedAt) {
        updatedItems++;
      }
      items[node.number] = transformPRNode(node);
    }

    hasNextPage = prsData.pageInfo.hasNextPage;
    cursor = prsData.pageInfo.endCursor;

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`Updated ${updatedItems} items`);
  return { updatedItems };
}

// ============================================================================
// API Handlers
// ============================================================================

// Handle sync endpoint: POST /api/sync-github-items?force
async function handleSyncGitHubItems(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.has('force');

    const result = await syncGitHubItems(env, force);

    return new Response(JSON.stringify({
      success: true,
      ...result
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// Handle GitHub items endpoint: GET /api/github-items?type=issues|prs&startDate=X&endDate=Y
async function handleGitHubItems(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') as 'issues' | 'prs';
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!type || !['issues', 'prs'].includes(type)) {
      return new Response(JSON.stringify({ error: 'type must be "issues" or "prs"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: 'startDate and endDate are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Load from KV
    const items = await loadGitHubItemsFromKV(env);
    const meta = await loadGitHubItemsMetaFromKV(env);

    if (!meta || Object.keys(items).length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No data available. Please trigger a sync first.',
        needsSync: true
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Filter items by type
    const targetType = type === 'issues' ? 'issue' : 'pr';
    const filteredItems = Object.values(items).filter(item => item.type === targetType);

    // Calculate daily open counts
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const dailyOpenCounts = calculateDailyOpenCounts(filteredItems, startDateObj, endDateObj);

    return new Response(JSON.stringify({
      type,
      dateRange: { start: startDate, end: endDate },
      data: dailyOpenCounts,
      totalItems: filteredItems.length,
      oldestDate: meta.oldestDate,
      lastSync: meta.lastSync
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    console.error('Error fetching GitHub items:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// Calculate the count of open items for each day in the range
function calculateDailyOpenCounts(
  items: GitHubItem[],
  startDate: Date,
  endDate: Date
): Array<{ date: string; openCount: number }> {
  const result: Array<{ date: string; openCount: number }> = [];
  
  // Iterate through each day in the range
  const currentDate = new Date(startDate);
  currentDate.setHours(23, 59, 59, 999); // End of day
  
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const dayEnd = new Date(currentDate);
    
    // Count items that were open on this day
    // An item is open on day D if:
    // - createdAt <= D AND (closedAt is null OR closedAt > D)
    let openCount = 0;
    
    for (const item of items) {
      const createdAt = new Date(item.createdAt);
      const closedAt = item.closedAt ? new Date(item.closedAt) : null;
      
      // Item must have been created by end of this day
      if (createdAt <= dayEnd) {
        // Item is open if not closed, or closed after this day
        if (!closedAt || closedAt > dayEnd) {
          openCount++;
        }
      }
    }
    
    result.push({ date: dateStr, openCount });
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return result;
}

// ============================================================================
// Issue Label Statistics
// ============================================================================

// Handle issue label stats API: GET /api/issue-label-stats?start=<date>&end=<date>
// Computes historical issue counts by label from the synced GitHub items
async function handleIssueLabelStats(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const startParam = url.searchParams.get('start');
    const endParam = url.searchParams.get('end');
    
    // Load all GitHub items from KV
    const items = await loadGitHubItemsFromKV(env);
    const meta = await loadGitHubItemsMetaFromKV(env);
    
    if (!meta || Object.keys(items).length === 0) {
      return new Response(JSON.stringify({
        timestamps: [],
        total: [],
        labels: {},
        message: 'No GitHub data available. Please trigger a sync first.',
        needsSync: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }
    
    // Filter to only issues (not PRs)
    const issues = Object.values(items).filter(item => item.type === 'issue');
    
    // Determine date range
    const endDate = endParam ? new Date(endParam) : new Date();
    const startDate = startParam ? new Date(startParam) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Generate daily data points
    const dataPoints = calculateDailyLabelCounts(issues, startDate, endDate);
    
    return new Response(JSON.stringify({
      ...dataPoints,
      lastSync: meta.lastSync,
      totalIssues: issues.length
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    console.error('Error fetching issue label stats:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// Calculate daily open issue counts broken down by label
function calculateDailyLabelCounts(
  issues: GitHubItem[],
  startDate: Date,
  endDate: Date
): { timestamps: number[]; total: number[]; labels: Record<string, number[]> } {
  const timestamps: number[] = [];
  const total: number[] = [];
  const labels: Record<string, number[]> = {};
  
  // Collect all unique labels from issues
  const allLabels = new Set<string>();
  for (const issue of issues) {
    for (const label of issue.labels) {
      allLabels.add(label.name);
    }
  }
  
  // Initialize label arrays
  for (const label of allLabels) {
    labels[label] = [];
  }
  
  // Iterate through each day in the range
  const currentDate = new Date(startDate);
  currentDate.setHours(23, 59, 59, 999); // End of day
  
  while (currentDate <= endDate) {
    const dayEnd = new Date(currentDate);
    const timestamp = Math.floor(dayEnd.getTime() / 1000);
    
    timestamps.push(timestamp);
    
    // Count issues that were open on this day and track by label
    let openCount = 0;
    const labelCounts: Record<string, number> = {};
    
    // Initialize label counts for this day
    for (const label of allLabels) {
      labelCounts[label] = 0;
    }
    
    for (const issue of issues) {
      const createdAt = new Date(issue.createdAt);
      const closedAt = issue.closedAt ? new Date(issue.closedAt) : null;
      
      // Issue is open on this day if created before/on this day AND (not closed OR closed after this day)
      if (createdAt <= dayEnd && (!closedAt || closedAt > dayEnd)) {
        openCount++;
        
        // Count this issue for each of its labels
        for (const label of issue.labels) {
          if (labelCounts[label.name] !== undefined) {
            labelCounts[label.name]++;
          }
        }
      }
    }
    
    total.push(openCount);
    
    // Add label counts to the arrays
    for (const label of allLabels) {
      labels[label].push(labelCounts[label]);
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return { timestamps, total, labels };
}

// ============================================================================
// Bus Factor Analysis
// ============================================================================

// Calculate bus factor from commit data
function calculateBusFactor(
  commits: Array<{ author: string | null }>,
  teamMembers: readonly string[]
): {
  busFactor: number;
  topContributors: BusFactorResult['topContributors'];
  teamMemberContributions: Record<string, number>;
} {
  // Count commits per author
  const authorCounts = new Map<string, number>();

  for (const commit of commits) {
    const author = commit.author;
    if (author) {
      authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    }
  }

  const totalCommits = commits.length;
  if (totalCommits === 0) {
    const emptyContributions: Record<string, number> = {};
    teamMembers.forEach(member => emptyContributions[member] = 0);
    return {
      busFactor: 0,
      topContributors: [],
      teamMemberContributions: emptyContributions,
    };
  }

  // Sort authors by commit count (descending)
  const sortedAuthors = Array.from(authorCounts.entries())
    .map(([login, commits]) => ({
      login,
      commits,
      percentage: (commits / totalCommits) * 100,
    }))
    .sort((a, b) => b.commits - a.commits);

  // Calculate bus factor (minimum contributors for 50% of commits)
  let cumulativePercentage = 0;
  let busFactor = 0;

  for (const author of sortedAuthors) {
    busFactor++;
    cumulativePercentage += author.percentage;
    if (cumulativePercentage >= 50) {
      break;
    }
  }

  // Calculate contributions for all team members
  const teamMemberContributions: Record<string, number> = {};
  teamMembers.forEach(member => {
    const memberCommits = authorCounts.get(member) || 0;
    teamMemberContributions[member] = (memberCommits / totalCommits) * 100;
  });

  return {
    busFactor,
    topContributors: sortedAuthors.slice(0, 10),
    teamMemberContributions,
  };
}

// Fetch commits for a directory from GitHub REST API
async function fetchDirectoryCommits(
  env: Env,
  directory: string
): Promise<Array<{ author: string | null }>> {
  const commits: Array<{ author: string | null }> = [];
  let page = 1;
  const perPage = 100;

  // Fetch last 6 months of commits
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sinceDate = sixMonthsAgo.toISOString();

  while (true) {
    const url = `https://api.github.com/repos/cloudflare/workers-sdk/commits?path=${encodeURIComponent(directory)}&per_page=${perPage}&page=${page}&since=${sinceDate}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Workers-SDK-CI-Analyzer',
        ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch commits for ${directory}: ${response.status}`);
      break;
    }

    const data = await response.json() as any[];
    if (data.length === 0) break;

    for (const commit of data) {
      commits.push({
        author: commit.author?.login || null
      });
    }

    if (data.length < perPage) break;
    page++;

    // Limit to prevent excessive API calls
    if (page > 10) break;
  }

  return commits;
}

// Analyze bus factor for a single directory
async function analyzeDirectoryBusFactor(
  env: Env,
  directory: string
): Promise<BusFactorResult> {
  try {
    const commits = await fetchDirectoryCommits(env, directory);
    const analysis = calculateBusFactor(commits, WRANGLER_TEAM_MEMBERS);

    return {
      directory,
      busFactor: analysis.busFactor,
      topContributors: analysis.topContributors,
      teamMemberContributions: analysis.teamMemberContributions,
    };
  } catch (error) {
    console.error(`Error analyzing directory ${directory}:`, error);
    const emptyContributions: Record<string, number> = {};
    WRANGLER_TEAM_MEMBERS.forEach(member => emptyContributions[member] = 0);
    return {
      directory,
      busFactor: 0,
      topContributors: [],
      teamMemberContributions: emptyContributions,
    };
  }
}

// Analyze all monitored directories
async function analyzeAllDirectories(env: Env): Promise<BusFactorResult[]> {
  const results: BusFactorResult[] = [];

  // Process directories in parallel batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < MONITORED_DIRECTORIES.length; i += batchSize) {
    const batch = MONITORED_DIRECTORIES.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(dir => analyzeDirectoryBusFactor(env, dir))
    );
    results.push(...batchResults);
    
    // Small delay between batches
    if (i + batchSize < MONITORED_DIRECTORIES.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

// Handle bus factor API: GET /api/bus-factor
async function handleBusFactor(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.has('refresh');

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await env.CI_DATA_KV.get(BUS_FACTOR_CACHE_KV_KEY, 'json') as {
        data: BusFactorResult[];
        timestamp: string;
      } | null;

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
        const oneHour = 60 * 60 * 1000;

        if (cacheAge < oneHour) {
          return new Response(JSON.stringify({
            data: cached.data,
            teamMembers: WRANGLER_TEAM_MEMBERS,
            cached: true,
            cachedAt: cached.timestamp
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=300'
            }
          });
        }
      }
    }

    // Analyze all directories
    console.log('Analyzing bus factor for all monitored directories...');
    const results = await analyzeAllDirectories(env);

    // Cache the results
    const cacheData = {
      data: results,
      timestamp: new Date().toISOString()
    };
    await env.CI_DATA_KV.put(BUS_FACTOR_CACHE_KV_KEY, JSON.stringify(cacheData), {
      expirationTtl: 60 * 60 * 2 // 2 hours
    });

    return new Response(JSON.stringify({
      data: results,
      teamMembers: WRANGLER_TEAM_MEMBERS,
      cached: false,
      analyzedAt: cacheData.timestamp
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    console.error('Error analyzing bus factor:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// ============================================================================
// Issue Triage
// ============================================================================

// Labels that indicate an issue is blocked/waiting (not untriaged)
const BLOCKING_LABELS = [
  'awaiting reporter response',
  'needs reproduction',
  'awaiting Cloudflare response',
  'blocked',
];

// Labels that indicate an issue is awaiting dev attention
const AWAITING_DEV_LABELS = [
  'awaiting reporter response',
  'needs reproduction',
  'awaiting dev response',
];

// Handle issue triage API: GET /api/issue-triage
async function handleIssueTriage(request: Request, env: Env): Promise<Response> {
  try {
    // Load all GitHub items from KV
    const items = await loadGitHubItemsFromKV(env);
    const meta = await loadGitHubItemsMetaFromKV(env);
    
    if (!meta || Object.keys(items).length === 0) {
      return new Response(JSON.stringify({
        untriaged: [],
        awaitingDev: [],
        message: 'No GitHub data available. Please trigger a sync first.',
        needsSync: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }
    
    // Filter to only open issues (not PRs)
    const openIssues = Object.values(items).filter(
      item => item.type === 'issue' && item.state === 'open'
    );
    
    // Categorize issues
    const untriaged: GitHubItem[] = [];
    const awaitingDev: GitHubItem[] = [];
    
    for (const issue of openIssues) {
      const labelNames = issue.labels.map(l => l.name.toLowerCase());
      
      // Check if issue has any blocking labels
      const hasBlockingLabel = BLOCKING_LABELS.some(
        blockingLabel => labelNames.includes(blockingLabel.toLowerCase())
      );
      
      // Check if issue has any awaiting dev labels
      const hasAwaitingDevLabel = AWAITING_DEV_LABELS.some(
        awaitingLabel => labelNames.includes(awaitingLabel.toLowerCase())
      );
      
      if (hasAwaitingDevLabel) {
        awaitingDev.push(issue);
      } else if (!hasBlockingLabel) {
        untriaged.push(issue);
      }
    }
    
    // Sort by created date (newest first)
    untriaged.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    awaitingDev.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    
    // Limit to top 100 each
    const limitedUntriaged = untriaged.slice(0, 100);
    const limitedAwaitingDev = awaitingDev.slice(0, 100);
    
    return new Response(JSON.stringify({
      untriaged: limitedUntriaged,
      awaitingDev: limitedAwaitingDev,
      totalUntriaged: untriaged.length,
      totalAwaitingDev: awaitingDev.length,
      lastSync: meta.lastSync
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    console.error('Error fetching issue triage data:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// ============================================================================
// PR Health
// ============================================================================

interface PRHealthItem {
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

// Handle PR health API: GET /api/pr-health?state=open|all
async function handlePRHealth(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const stateFilter = url.searchParams.get('state') || 'open';
    const sortBy = url.searchParams.get('sort') || 'stale'; // stale, age, comments
    const order = url.searchParams.get('order') || 'desc';
    
    // Load all GitHub items from KV
    const items = await loadGitHubItemsFromKV(env);
    const meta = await loadGitHubItemsMetaFromKV(env);
    
    if (!meta || Object.keys(items).length === 0) {
      return new Response(JSON.stringify({
        prs: [],
        message: 'No GitHub data available. Please trigger a sync first.',
        needsSync: true
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }
    
    const now = Date.now();
    
    // Filter to PRs and calculate health metrics
    let prs: PRHealthItem[] = Object.values(items)
      .filter(item => {
        if (item.type !== 'pr') return false;
        if (stateFilter === 'open') return item.state === 'open';
        return true;
      })
      .map(item => {
        const createdAt = new Date(item.createdAt).getTime();
        const updatedAt = new Date(item.updatedAt).getTime();
        const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        const staleDays = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
        
        return {
          number: item.number,
          title: item.title,
          state: item.state,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          author: item.author,
          labels: item.labels,
          commentCount: item.commentCount || 0,
          ageDays,
          staleDays
        };
      });
    
    // Sort
    prs.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'stale':
          comparison = a.staleDays - b.staleDays;
          break;
        case 'age':
          comparison = a.ageDays - b.ageDays;
          break;
        case 'comments':
          comparison = (a.commentCount || 0) - (b.commentCount || 0);
          break;
        default:
          comparison = a.staleDays - b.staleDays;
      }
      return order === 'desc' ? -comparison : comparison;
    });
    
    // Limit to top 100
    const limitedPrs = prs.slice(0, 100);
    
    // Calculate summary stats
    const totalPrs = prs.length;
    const avgAge = prs.length > 0 
      ? Math.round(prs.reduce((sum, pr) => sum + pr.ageDays, 0) / prs.length)
      : 0;
    const avgStale = prs.length > 0
      ? Math.round(prs.reduce((sum, pr) => sum + pr.staleDays, 0) / prs.length)
      : 0;
    const staleCount = prs.filter(pr => pr.staleDays > 14).length;
    const veryStaleCount = prs.filter(pr => pr.staleDays > 30).length;
    
    return new Response(JSON.stringify({
      prs: limitedPrs,
      total: totalPrs,
      stats: {
        avgAgeDays: avgAge,
        avgStaleDays: avgStale,
        staleCount, // > 14 days
        veryStaleCount // > 30 days
      },
      lastSync: meta.lastSync
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error: any) {
    console.error('Error fetching PR health data:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
