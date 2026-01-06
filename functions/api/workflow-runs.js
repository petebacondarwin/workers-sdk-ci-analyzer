export async function onRequest(context) {
  const { request, env } = context;
  
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    // Fetch ALL workflow runs across all workflows
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
