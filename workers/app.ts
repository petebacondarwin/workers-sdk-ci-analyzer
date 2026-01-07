import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  // @ts-ignore
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
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
    
    // All other requests go to React Router
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;

// Include all the API handler functions from the old worker.js
async function handleCIData(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    
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
      jobHistory: []
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
    
    return new Response(JSON.stringify(processedData), {
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
