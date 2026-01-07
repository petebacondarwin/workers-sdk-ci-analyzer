# Deployment Guide

## Overview

This application uses Cloudflare Workers with:
- **KV Storage**: Stores CI data fetched from GitHub API
- **Cron Trigger**: Automatically refreshes data daily at 6 AM UTC
- **React Router 7**: SSR-enabled React application

## Prerequisites

1. Cloudflare account
2. Wrangler CLI installed and authenticated (`wrangler login`)
3. (Optional) GitHub Personal Access Token for higher API rate limits

## Initial Deployment

### 1. Deploy with Auto-provisioning

The `--x-provision` flag automatically creates the KV namespace:

```bash
npm run deploy
```

This will:
- Build the React application
- Create the KV namespace `CI_DATA_KV` if it doesn't exist
- Deploy the Worker with the cron trigger
- Set up the scheduled job (runs daily at 6 AM UTC)

**After first deployment**, if you want to use `wrangler kv:*` commands locally, add the KV ID to `wrangler.jsonc`:

```bash
# Get the KV namespace ID
wrangler kv:namespace list

# Copy the ID and update wrangler.jsonc:
# "kv_namespaces": [
#   {
#     "binding": "CI_DATA_KV",
#     "id": "YOUR_KV_ID_HERE"  // ← Add this line
#   }
# ]
```

### 2. Add GitHub Token (Optional but Recommended)

Without a token, you're limited to 60 requests/hour. With a token, you get 5,000 requests/hour.

```bash
wrangler secret put GITHUB_TOKEN
```

Then paste your GitHub Personal Access Token when prompted.

**To create a GitHub token:**
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scope: `public_repo` (read access to public repositories)
4. Copy the token

### 3. Manually Trigger Initial Data Fetch

After deployment, trigger the data fetch manually (don't wait for the cron):

```bash
curl -X POST https://workers-sdk-ci-analyzer.YOUR_SUBDOMAIN.workers.dev/api/refresh
```

Replace `YOUR_SUBDOMAIN` with your Cloudflare Workers subdomain.

Or visit your worker URL and the first request will trigger a fetch if KV is empty.

## How It Works

### Data Flow

1. **Cron Job (Daily at 6 AM UTC)**
   - Worker's `scheduled()` handler runs
   - Fetches last 100 workflow runs from `changeset-release/main` branch
   - Processes job statistics (failure rates, 7-day rolling averages)
   - Stores processed data in KV with 7-day TTL

2. **Website Requests**
   - User visits the dashboard
   - Frontend calls `/api/ci-data`
   - Worker reads from KV cache (fast!)
   - Fallback to fresh fetch if KV is empty

3. **Manual Refresh**
   - POST to `/api/refresh` to force a data refresh
   - Useful after deployment or for testing

### KV Storage Structure

**Key**: `ci-data`

**Value**:
```json
{
  "jobStats": {
    "Job Name": {
      "name": "Job Name",
      "totalRuns": 100,
      "failures": 2,
      "successes": 98,
      "failureRate": 2.0,
      "last7Days": {
        "totalRuns": 20,
        "failures": 0,
        "successes": 20,
        "failureRate": 0
      },
      "recentFailures": [...]
    }
  },
  "jobHistory": [...],
  "lastUpdated": "2026-01-07T17:00:00.000Z",
  "totalRuns": 100
}
```

**TTL**: 7 days

## Cron Schedule

Current schedule: `0 6 * * *` (6 AM UTC daily)

To change the schedule, edit `wrangler.jsonc`:

```jsonc
"triggers": {
  "crons": ["0 */6 * * *"]  // Every 6 hours
}
```

Common cron patterns:
- `0 * * * *` - Every hour
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight UTC
- `0 6 * * *` - Daily at 6 AM UTC (current)

## Monitoring

### View Logs

```bash
wrangler tail
```

### Check KV Data

```bash
wrangler kv:key get --binding=CI_DATA_KV ci-data
```

### Trigger Cron Manually (for testing)

```bash
wrangler trigger --cron "0 6 * * *"
```

Or use the API endpoint:

```bash
curl -X POST https://your-worker.workers.dev/api/refresh
```

## Updating the Application

1. Make your changes
2. Run tests locally: `npm run dev`
3. Deploy: `npm run deploy`

The deployment will:
- Build the new version
- Update the Worker code
- Keep existing KV data intact
- Maintain the cron schedule

## Troubleshooting

### "KV namespace not found"

Solution: Deploy with `--x-provision`:
```bash
npm run deploy
```

### "No data available" on dashboard

Solutions:
1. Manually trigger refresh: `curl -X POST https://your-worker.workers.dev/api/refresh`
2. Wait for next cron run (6 AM UTC)
3. Check logs: `wrangler tail`

### "GitHub API rate limit exceeded"

Solution: Add a GitHub token (see step 2 above)

### Cron not running

1. Check deployment: `wrangler deployments list`
2. View cron status in Cloudflare dashboard: Workers & Pages → Your Worker → Triggers
3. Manually trigger: `wrangler trigger --cron "0 6 * * *"`

## Environment Variables

Optional configuration in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    // Add non-secret variables here
  }
}
```

For secrets, use:
```bash
wrangler secret put SECRET_NAME
```

## Production Deployment

For production with custom domain:

1. Add route in `wrangler.jsonc`:
```jsonc
{
  "routes": [
    {
      "pattern": "ci-dashboard.example.com/*",
      "zone_name": "example.com"
    }
  ]
}
```

2. Deploy to production:
```bash
npm run deploy:prod
```

## Cost Estimation

With Cloudflare Workers free tier:
- **Requests**: 100,000/day (plenty for a dashboard)
- **KV Storage**: 1 GB (we use < 1 MB)
- **KV Reads**: 100,000/day (one per page visit)
- **KV Writes**: 1,000/day (one per cron job = 1/day)
- **Cron Triggers**: Included

**Expected cost**: $0/month (within free tier)

## Security

- GitHub token stored as Worker secret (encrypted)
- CORS enabled for API endpoints
- Rate limiting handled by GitHub API
- No sensitive data stored in KV

## Support

For issues or questions:
1. Check logs: `wrangler tail`
2. Review Cloudflare Workers documentation
3. Check GitHub Actions API status: https://www.githubstatus.com/
