# Deployment Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Test Locally

```bash
npm run dev
```

Visit `http://localhost:8787` to see the dashboard.

### 3. Deploy to Cloudflare Workers

```bash
npm run deploy
```

## Configuration

### GitHub Token (Recommended)

Without authentication, you're limited to 60 requests/hour. With a GitHub token, this increases to 5,000 requests/hour.

#### Option 1: Environment Variable (Development)

1. Copy the example file:
```bash
cp .dev.vars.example .dev.vars
```

2. Edit `.dev.vars` and add your token:
```
GITHUB_TOKEN=ghp_your_token_here
```

3. The token will be automatically loaded during `npm run dev`

#### Option 2: Wrangler Secret (Production)

For production deployment, use Wrangler secrets:

```bash
wrangler secret put GITHUB_TOKEN
# Enter your token when prompted
```

#### Creating a GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token" (classic)
3. Give it a descriptive name (e.g., "Workers SDK CI Analyzer")
4. Select scopes:
   - For public repos: `public_repo`
   - For private repos: `repo`
5. Click "Generate token"
6. Copy the token immediately (you won't see it again!)

## Customization

### Analyzing Different Repositories

Edit `src/index.js` and change the repository owner/name:

```javascript
const REPO_OWNER = 'cloudflare';
const REPO_NAME = 'workers-sdk';
```

### Changing the Workflow

By default, the dashboard analyzes the "CI" workflow (ID: 15325074). To analyze a different workflow:

1. Find the workflow ID:
```bash
curl https://api.github.com/repos/cloudflare/workers-sdk/actions/workflows
```

2. Update the default in `src/index.js`:
```javascript
const workflowId = searchParams.get('workflow_id') || 'YOUR_WORKFLOW_ID';
```

### Adjusting Cache Duration

In `src/index.js`, modify the `Cache-Control` header:

```javascript
'Cache-Control': 'public, max-age=300' // 5 minutes (300 seconds)
```

## Troubleshooting

### Rate Limit Errors

If you see "API rate limit exceeded":
1. Add a GitHub token (see above)
2. Reduce the number of runs analyzed (use 20 instead of 50/100)
3. Wait for the rate limit to reset (shown in error message)

### CORS Errors

If you see CORS errors in the browser console:
- Ensure you're accessing via the correct URL
- Check that the Worker is properly deployed

### Data Not Loading

1. Check browser console for errors
2. Verify the GitHub API is accessible:
```bash
curl https://api.github.com/repos/cloudflare/workers-sdk/actions/workflows
```
3. Check Wrangler logs:
```bash
wrangler tail
```

## Monitoring

### View Live Logs

```bash
wrangler tail
```

### Check Deployment Status

```bash
wrangler deployments list
```

## Custom Domain

To use a custom domain:

1. Add to `wrangler.jsonc`:
```jsonc
{
  "routes": [
    { "pattern": "ci-analyzer.yourdomain.com", "custom_domain": true }
  ]
}
```

2. Deploy:
```bash
npm run deploy
```

3. Configure DNS in Cloudflare Dashboard

## Performance Tips

1. **Enable Caching**: The API responses are cached for 5 minutes by default
2. **Reduce Data**: Analyze fewer runs (20-50) for faster loading
3. **GitHub Token**: Always use a token to avoid rate limit delays

## Security Notes

- Never commit `.dev.vars` or tokens to git
- Use Wrangler secrets for production
- Rotate tokens regularly
- Use tokens with minimal required scopes

## Updating

To update the dashboard:

1. Make changes to files in `src/` or `public/`
2. Test locally: `npm run dev`
3. Deploy: `npm run deploy`

Changes are live immediately after deployment!
