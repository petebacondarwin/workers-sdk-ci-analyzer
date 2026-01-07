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
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    const runsResponse = await fetch(
      `https://api.github.com/repos/cloudflare/workers-sdk/actions/runs?per_page=${limit}&status=completed`,
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
      runs: [],
      flakyTests: {},
      failureRates: {},
      taskDurations: {},
      rerunFlakiness: {}
    };
    
    // Group runs by head SHA to detect re-runs
    const runsByCommit: any = {};
    for (const run of runs) {
      const sha = run.head_sha;
      if (!runsByCommit[sha]) {
        runsByCommit[sha] = [];
      }
      runsByCommit[sha].push(run);
    }
    
    // Detect flaky tests from re-runs
    for (const sha in runsByCommit) {
      const commitRuns = runsByCommit[sha].sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      if (commitRuns.length > 1) {
        const failedRuns = commitRuns.filter((r: any) => r.conclusion === 'failure');
        const successfulRuns = commitRuns.filter((r: any) => r.conclusion === 'success');
        
        if (failedRuns.length > 0 && successfulRuns.length > 0) {
          const latestSuccess = successfulRuns[successfulRuns.length - 1];
          
          if (!processedData.rerunFlakiness[sha]) {
            processedData.rerunFlakiness[sha] = {
              commit: sha.substring(0, 7),
              fullSha: sha,
              attempts: commitRuns.length,
              failures: failedRuns.length,
              successes: successfulRuns.length,
              runs: commitRuns.map((r: any) => ({
                id: r.id,
                number: r.run_number,
                conclusion: r.conclusion,
                created_at: r.created_at,
                url: r.html_url
              })),
              firstFailure: failedRuns[0],
              finalSuccess: latestSuccess
            };
          }
        }
      }
    }
    
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
      
      const runData: any = {
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        created_at: run.created_at,
        updated_at: run.updated_at,
        html_url: run.html_url,
        run_number: run.run_number,
        head_sha: run.head_sha,
        jobs: []
      };
      
      for (const job of jobs) {
        const jobData: any = {
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          started_at: job.started_at,
          completed_at: job.completed_at,
          html_url: job.html_url,
          steps: []
        };
        
        // Check if this job was cached by examining the steps
        let isCached = false;
        if (job.steps) {
          for (const step of job.steps) {
            jobData.steps.push({
              name: step.name,
              status: step.status,
              conclusion: step.conclusion,
              number: step.number,
              started_at: step.started_at,
              completed_at: step.completed_at
            });
            
            const stepName = step.name.toLowerCase();
            
            // Check if any step indicates a cache hit
            // Turbo will say "cache hit, suppressing logs" when tasks are cached
            if (stepName.includes('turbo') || stepName.includes('build') || stepName.includes('test')) {
              // We would need to fetch the logs to check for "cache hit, suppressing logs"
              // For now, we'll detect very fast runs (< 5 seconds for turbo tasks) as potentially cached
              if (step.started_at && step.completed_at) {
                const stepDuration = (new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000;
                // If a turbo/build/test step completes in under 5 seconds, it's likely cached
                if (stepDuration < 5 && stepDuration > 0) {
                  isCached = true;
                }
              }
            }
            
            // Detect retries and flaky tests
            if ((stepName.includes('retry') || stepName.includes('attempt')) && 
                step.conclusion === 'success') {
              const testName = step.name;
              if (!processedData.flakyTests[testName]) {
                processedData.flakyTests[testName] = {
                  name: testName,
                  retryCount: 0,
                  occurrences: 0,
                  rerunCount: 0,
                  rerunOccurrences: 0,
                  runs: [],
                  rerunInstances: []
                };
              }
              processedData.flakyTests[testName].retryCount++;
              processedData.flakyTests[testName].occurrences++;
              processedData.flakyTests[testName].runs.push({
                runId: run.id,
                runNumber: run.run_number,
                jobName: job.name,
                url: run.html_url
              });
            }
          }
        }
        
        // Track duration only if not cached
        if (job.started_at && job.completed_at && !isCached) {
          const duration = (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000;
          jobData.duration = duration;
          jobData.cached = false;
          
          const taskName = job.name;
          if (!processedData.taskDurations[taskName]) {
            processedData.taskDurations[taskName] = {
              name: taskName,
              durations: [],
              totalRuns: 0,
              cachedRuns: 0,
              avgDuration: 0
            };
          }
          processedData.taskDurations[taskName].durations.push(duration);
          processedData.taskDurations[taskName].totalRuns++;
        } else if (isCached) {
          jobData.cached = true;
          const taskName = job.name;
          if (!processedData.taskDurations[taskName]) {
            processedData.taskDurations[taskName] = {
              name: taskName,
              durations: [],
              totalRuns: 0,
              cachedRuns: 0,
              avgDuration: 0
            };
          }
          processedData.taskDurations[taskName].cachedRuns++;
        }
        
        if (job.conclusion) {
          const jobName = job.name;
          if (!processedData.failureRates[jobName]) {
            processedData.failureRates[jobName] = {
              name: jobName,
              totalRuns: 0,
              failures: 0,
              successes: 0,
              failureRate: 0
            };
          }
          processedData.failureRates[jobName].totalRuns++;
          if (job.conclusion === 'failure') {
            processedData.failureRates[jobName].failures++;
          } else if (job.conclusion === 'success') {
            processedData.failureRates[jobName].successes++;
          }
        }
        
        runData.jobs.push(jobData);
      }
      
      processedData.runs.push(runData);
    }
    
    // Detect job-level flakiness from re-runs
    const jobsByCommitAndName: any = {};
    for (const run of processedData.runs) {
      for (const job of run.jobs) {
        const key = `${run.head_sha}:${job.name}`;
        if (!jobsByCommitAndName[key]) {
          jobsByCommitAndName[key] = [];
        }
        jobsByCommitAndName[key].push({
          ...job,
          runId: run.id,
          runNumber: run.run_number,
          runUrl: run.html_url,
          runCreatedAt: run.created_at,
          commitSha: run.head_sha
        });
      }
    }
    
    for (const key in jobsByCommitAndName) {
      const jobs = jobsByCommitAndName[key].sort((a: any, b: any) => 
        new Date(a.runCreatedAt).getTime() - new Date(b.runCreatedAt).getTime()
      );
      
      if (jobs.length > 1) {
        const failedJobs = jobs.filter((j: any) => j.conclusion === 'failure');
        const successfulJobs = jobs.filter((j: any) => j.conclusion === 'success');
        
        if (failedJobs.length > 0 && successfulJobs.length > 0) {
          const jobName = jobs[0].name;
          const commitSha = jobs[0].commitSha;
          
          if (!processedData.flakyTests[jobName]) {
            processedData.flakyTests[jobName] = {
              name: jobName,
              retryCount: 0,
              occurrences: 0,
              rerunCount: 0,
              rerunOccurrences: 0,
              runs: [],
              rerunInstances: []
            };
          }
          
          processedData.flakyTests[jobName].rerunCount += failedJobs.length;
          processedData.flakyTests[jobName].rerunOccurrences++;
          processedData.flakyTests[jobName].rerunInstances.push({
            commit: commitSha.substring(0, 7),
            fullCommit: commitSha,
            attempts: jobs.length,
            failures: failedJobs.length,
            successes: successfulJobs.length,
            failedRuns: failedJobs.map((j: any) => ({
              runNumber: j.runNumber,
              url: j.runUrl,
              createdAt: j.runCreatedAt
            })),
            successfulRuns: successfulJobs.map((j: any) => ({
              runNumber: j.runNumber,
              url: j.runUrl,
              createdAt: j.runCreatedAt
            }))
          });
        }
      }
    }
    
    for (const taskName in processedData.taskDurations) {
      const task = processedData.taskDurations[taskName];
      task.avgDuration = task.durations.reduce((a: number, b: number) => a + b, 0) / task.durations.length;
      task.maxDuration = Math.max(...task.durations);
      task.minDuration = Math.min(...task.durations);
    }
    
    for (const jobName in processedData.failureRates) {
      const job = processedData.failureRates[jobName];
      job.failureRate = (job.failures / job.totalRuns) * 100;
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
