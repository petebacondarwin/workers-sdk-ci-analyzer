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
            recentFailures: []
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
  }
  
  // Store in KV
  await env.CI_DATA_KV.put('ci-data', JSON.stringify(processedData), {
    expirationTtl: 60 * 60 * 24 * 7 // 7 days
  });
  
  return processedData;
}

// Handle CI data API endpoint - read from KV
async function handleCIData(request: Request, env: Env) {
  try {
    // Try to get data from KV first
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
    const url = new URL(request.url);
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

// Handle manual refresh endpoint
async function handleRefresh(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    
    const processedData = await fetchAndStoreCIData(env, limit);
    
    return new Response(JSON.stringify({
      success: true,
      message: 'CI data refreshed successfully',
      lastUpdated: processedData.lastUpdated,
      totalRuns: processedData.totalRuns
    }), {
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
