# Historical Data Backfill Guide

## Overview

The system automatically collects CI data daily via cron (6 AM UTC). However, you can manually backfill historical data to populate the last 30 days or fill any gaps.

## How Backfill Works

1. **Gap Detection**: Checks `date-index` for missing dates
2. **GitHub API Query**: For each missing date, fetches workflow runs from `changeset-release/main`
3. **Data Processing**: Calculates failure rates for each job
4. **KV Storage**: Stores as `daily:YYYY-MM-DD` with 180-day TTL
5. **Index Update**: Adds date to `date-index`

## Backfill Scenarios

### Scenario 1: Initial Deployment (No Historical Data)

When you first deploy, there's no historical data. Backfill will fetch the last 30 days.

```bash
# After deployment
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
```

**Expected behavior:**

- Detects gap from 30 days ago to today
- Fetches data for each day (30 API calls to GitHub)
- Takes ~5-10 minutes depending on GitHub API rate limits
- Creates 30 daily snapshots in KV

### Scenario 2: Regular Operation (No Gaps)

If cron runs daily, there are no gaps.

```bash
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
```

**Expected response:**

```json
{
  "success": true,
  "message": "CI data refreshed successfully. No gaps found in historical data.",
  "lastUpdated": "2026-01-08T18:00:00.000Z",
  "totalRuns": 100
}
```

### Scenario 3: Gaps in Data (Missed Cron Runs)

If cron didn't run for several days, gaps will be detected and filled.

```bash
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
```

**Expected response:**

```json
{
  "success": true,
  "message": "CI data refreshed successfully. Found 3 gap(s) in historical data. Backfilling... Backfilled data from 2026-01-05T00:00:00.000Z to 2026-01-07T00:00:00.000Z",
  "lastUpdated": "2026-01-08T18:00:00.000Z",
  "totalRuns": 100,
  "gaps": [
    {
      "start": "2026-01-05T00:00:00.000Z",
      "end": "2026-01-07T00:00:00.000Z"
    }
  ]
}
```

## Backfill Limitations

### GitHub API Rate Limits

- **Without Token**: 60 requests/hour (can backfill ~50 days/hour)
- **With Token**: 5,000 requests/hour (can backfill entire 6 months quickly)

To add a GitHub token:

```bash
wrangler secret put GITHUB_TOKEN
```

### Processing Time

- **Per Day**: ~1-3 seconds (fetch runs + fetch job details)
- **30 Days**: ~1-2 minutes
- **180 Days**: ~5-10 minutes

### Worker Timeout

Cloudflare Workers have execution limits:

- **Free Plan**: 10 seconds CPU time
- **Paid Plan**: 30 seconds CPU time (can be extended)

**Note**: Backfill processes ONE gap at a time to avoid timeouts. If you have multiple gaps, run the backfill endpoint multiple times.

## Manual Backfill for Specific Dates

If you need to backfill specific dates, you can trigger the cron manually or use the refresh endpoint. The system will automatically detect and fill gaps.

### Example: Fill Last 7 Days

1. Check current data:

```bash
curl "https://your-worker.workers.dev/api/history?days=7"
```

1. Trigger backfill:

```bash
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
```

1. Verify:

```bash
curl "https://your-worker.workers.dev/api/history?days=7"
```

## Monitoring Backfill Progress

### View Logs

```bash
wrangler tail
```

You'll see log messages like:

```
Backfilling data from 2026-01-01T00:00:00.000Z to 2026-01-07T00:00:00.000Z
Fetching data for 2026-01-01
Stored daily snapshot for 2026-01-01
Fetching data for 2026-01-02
Stored daily snapshot for 2026-01-02
...
```

### Check KV Directly

```bash
# List all daily keys
wrangler kv:key list --binding=CI_DATA_KV --prefix="daily:"

# Get specific day's data
wrangler kv:key get --binding=CI_DATA_KV "daily:2026-01-08"

# Get date index
wrangler kv:key get --binding=CI_DATA_KV "date-index"
```

## Troubleshooting

### Issue: "No gaps found" but data is missing

**Solution**: Check if dates exist in index but keys don't:

```bash
# Get index
wrangler kv:key get --binding=CI_DATA_KV "date-index"

# Check if keys exist
wrangler kv:key get --binding=CI_DATA_KV "daily:2026-01-08"
```

If dates are in index but keys don't exist, delete and rebuild index:

```bash
wrangler kv:key delete --binding=CI_DATA_KV "date-index"
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
```

### Issue: "GitHub API rate limit exceeded"

**Solution**: Add GitHub token (see above) or wait for rate limit to reset.

### Issue: Backfill timeout

**Solution**: The backfill only processes the first gap. Run multiple times:

```bash
# Run 3 times to fill 3 separate gaps
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"
```

### Issue: No workflow runs on certain dates

**Solution**: This is normal if there were no releases on those days. The system will log "No runs found for YYYY-MM-DD" and continue.

## Best Practices

1. **Initial Setup**: Run backfill immediately after first deployment
2. **Regular Monitoring**: Check logs weekly to ensure cron is running
3. **GitHub Token**: Always configure a token for production
4. **Multiple Gaps**: Run backfill multiple times if needed
5. **Verification**: Use `/api/history` to verify data completeness

## Production Deployment Checklist

- [ ] Deploy worker: `npm run deploy`
- [ ] Configure GitHub token: `wrangler secret put GITHUB_TOKEN`
- [ ] Trigger initial backfill: `curl -X POST "https://your-worker.workers.dev/api/refresh?backfill=true"`
- [ ] Wait 2-5 minutes for backfill to complete
- [ ] Verify data: `curl "https://your-worker.workers.dev/api/history?days=30"`
- [ ] Check cron is scheduled: View in Cloudflare dashboard → Workers & Pages → Your Worker → Triggers
- [ ] Monitor logs: `wrangler tail`

## KV Storage Usage

With 180 days of retention:

- **~180 daily snapshots** × ~10 KB each = ~1.8 MB total
- **Well within** Cloudflare's 1 GB free tier limit

## Automatic Maintenance

The system automatically:

- ✅ Expires old data after 180 days (TTL)
- ✅ Limits index to last 180 dates
- ✅ Runs daily cron at 6 AM UTC
- ✅ Deduplicates (one snapshot per day)
