export async function onRequest(context) {
  const { request, env } = context;
  
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
