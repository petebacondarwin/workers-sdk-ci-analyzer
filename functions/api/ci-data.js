export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const workflowId = url.searchParams.get('workflow_id') || '15325074'; // Default to CI workflow
    
    // Fetch workflow runs from GitHub API
    const runsResponse = await fetch(
      `https://api.github.com/repos/cloudflare/workers-sdk/actions/workflows/${workflowId}/runs?per_page=${limit}&status=completed`,
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
    
    const runsData = await runsResponse.json();
    const runs = runsData.workflow_runs || [];
    
    // Process runs to extract CI metrics
    const processedData = {
      runs: [],
      flakyTests: {},
      failureRates: {},
      taskDurations: {},
      rerunFlakiness: {}
    };
    
    // Group runs by head SHA to detect re-runs
    const runsByCommit = {};
    for (const run of runs) {
      const sha = run.head_sha;
      if (!runsByCommit[sha]) {
        runsByCommit[sha] = [];
      }
      runsByCommit[sha].push(run);
    }
    
    // Detect flaky tests from re-runs
    for (const sha in runsByCommit) {
      const commitRuns = runsByCommit[sha].sort((a, b) => 
        new Date(a.created_at) - new Date(b.created_at)
      );
      
      // Check if any run failed and was later re-run successfully
      if (commitRuns.length > 1) {
        const failedRuns = commitRuns.filter(r => r.conclusion === 'failure');
        const successfulRuns = commitRuns.filter(r => r.conclusion === 'success');
        
        if (failedRuns.length > 0 && successfulRuns.length > 0) {
          // This commit had failures followed by success - potential flakiness
          const latestSuccess = successfulRuns[successfulRuns.length - 1];
          
          // Mark this as a re-run flakiness indicator
          if (!processedData.rerunFlakiness[sha]) {
            processedData.rerunFlakiness[sha] = {
              commit: sha.substring(0, 7),
              fullSha: sha,
              attempts: commitRuns.length,
              failures: failedRuns.length,
              successes: successfulRuns.length,
              runs: commitRuns.map(r => ({
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
      // Fetch jobs for each run
      const jobsResponse = await fetch(run.jobs_url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'Workers-SDK-CI-Analyzer',
          ...(env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${env.GITHUB_TOKEN}` } : {})
        }
      });
      
      if (!jobsResponse.ok) continue;
      
      const jobsData = await jobsResponse.json();
      const jobs = jobsData.jobs || [];
      
      const runData = {
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
        const jobData = {
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          started_at: job.started_at,
          completed_at: job.completed_at,
          html_url: job.html_url,
          steps: []
        };
        
        // Calculate duration
        if (job.started_at && job.completed_at) {
          const duration = (new Date(job.completed_at) - new Date(job.started_at)) / 1000;
          jobData.duration = duration;
          
          // Track task durations
          const taskName = job.name;
          if (!processedData.taskDurations[taskName]) {
            processedData.taskDurations[taskName] = {
              name: taskName,
              durations: [],
              totalRuns: 0,
              avgDuration: 0
            };
          }
          processedData.taskDurations[taskName].durations.push(duration);
          processedData.taskDurations[taskName].totalRuns++;
        }
        
        // Process steps for retry detection
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
            
            // Detect retries and flaky tests
            const stepName = step.name.toLowerCase();
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
        
        // Track failure rates
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
    const jobsByCommitAndName = {};
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
    
    // Check for jobs that failed and then passed on re-run
    for (const key in jobsByCommitAndName) {
      const jobs = jobsByCommitAndName[key].sort((a, b) => 
        new Date(a.runCreatedAt) - new Date(b.runCreatedAt)
      );
      
      if (jobs.length > 1) {
        const failedJobs = jobs.filter(j => j.conclusion === 'failure');
        const successfulJobs = jobs.filter(j => j.conclusion === 'success');
        
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
            failedRuns: failedJobs.map(j => ({
              runNumber: j.runNumber,
              url: j.runUrl,
              createdAt: j.runCreatedAt
            })),
            successfulRuns: successfulJobs.map(j => ({
              runNumber: j.runNumber,
              url: j.runUrl,
              createdAt: j.runCreatedAt
            }))
          });
        }
      }
    }
    
    // Calculate averages and rates
    for (const taskName in processedData.taskDurations) {
      const task = processedData.taskDurations[taskName];
      task.avgDuration = task.durations.reduce((a, b) => a + b, 0) / task.durations.length;
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
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
