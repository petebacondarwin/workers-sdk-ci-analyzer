# Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Workers                      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Cron Trigger (Daily 6 AM UTC)           │  │
│  │                                                       │  │
│  │  1. Fetch workflow runs from GitHub API              │  │
│  │  2. Filter: changeset-release/main branch            │  │
│  │  3. Process job statistics & failure rates           │  │
│  │  4. Store in KV with 7-day TTL                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  KV Storage                           │  │
│  │                                                       │  │
│  │  Key: "ci-data"                                       │  │
│  │  Value: { jobStats, jobHistory, lastUpdated }        │  │
│  │  TTL: 7 days                                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              HTTP Handler (fetch)                     │  │
│  │                                                       │  │
│  │  GET  /api/ci-data     → Read from KV (cached)       │  │
│  │  POST /api/refresh     → Force refresh & update KV   │  │
│  │  GET  /*               → React Router SSR            │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │   Web Browser  │
                   │                │
                   │  React Router  │
                   │  Dashboard UI  │
                   └────────────────┘
```

## Data Flow

### 1. Scheduled Data Collection (Cron)

**Trigger**: Daily at 6 AM UTC

**Process**:
```typescript
scheduled() handler
  ↓
fetchAndStoreCIData()
  ↓
GitHub API: /repos/cloudflare/workers-sdk/actions/runs
  ↓
Filter: branch=changeset-release/main
  ↓
For each workflow run:
  - Fetch jobs
  - Skip cancelled/skipped jobs
  - Calculate failure rates
  - Track 7-day rolling averages
  ↓
Store in KV: { jobStats, jobHistory, lastUpdated }
```

### 2. User Request Flow

**Request**: `GET /`

**Process**:
```typescript
Browser → Worker
  ↓
React Router SSR
  ↓
Renders homepage with <script> tags
  ↓
Browser loads React app
  ↓
useCIData() hook calls /api/ci-data
  ↓
Worker reads from KV (fast!)
  ↓
Return cached data
  ↓
React renders JobFailureRatesView
```

### 3. Manual Refresh Flow

**Request**: `POST /api/refresh`

**Process**:
```typescript
Manual trigger
  ↓
fetchAndStoreCIData()
  ↓
Fetch fresh data from GitHub
  ↓
Process statistics
  ↓
Update KV
  ↓
Return success response
```

## Key Features

### Performance Optimizations

1. **KV Cache**: Data served from edge cache, not GitHub API
2. **SSR**: Initial page load is server-rendered (fast FCP)
3. **Scheduled Updates**: Data refreshed automatically, not on user request
4. **7-day TTL**: Automatic cleanup of old data

### Resilience

1. **Fallback Logic**: If KV is empty, fetch fresh data
2. **Error Handling**: Graceful degradation on API failures
3. **Rate Limiting**: GitHub token support for higher limits

### Data Quality

1. **Branch Filtering**: Only `changeset-release/main` data
2. **Status Filtering**: Ignores cancelled/skipped jobs
3. **Rolling Averages**: 7-day window for trend detection
4. **Recent Failures**: Links to last 5 failed job runs

## API Endpoints

### `GET /api/ci-data`

**Purpose**: Get CI statistics

**Response**:
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
      "recentFailures": [
        {
          "runId": 12345,
          "runNumber": 678,
          "runUrl": "https://github.com/...",
          "createdAt": "2026-01-07T12:00:00Z",
          "jobUrl": "https://github.com/..."
        }
      ]
    }
  },
  "jobHistory": [...],
  "lastUpdated": "2026-01-07T06:00:00Z",
  "totalRuns": 100
}
```

**Headers**:
- `X-Data-Source: kv-cache` - Data from KV
- `X-Data-Source: fresh-fetch` - Data freshly fetched

### `POST /api/refresh`

**Purpose**: Manually trigger data refresh

**Query Params**:
- `limit` (optional): Number of workflow runs to fetch (default: 100)

**Response**:
```json
{
  "success": true,
  "message": "CI data refreshed successfully",
  "lastUpdated": "2026-01-07T18:00:00Z",
  "totalRuns": 100
}
```

## GitHub API Integration

### Endpoints Used

1. **Workflow Runs**:
   ```
   GET /repos/cloudflare/workers-sdk/actions/runs
   ?per_page=100
   &branch=changeset-release/main
   ```

2. **Job Details**:
   ```
   GET /repos/cloudflare/workers-sdk/actions/runs/{run_id}/jobs
   ```

### Rate Limits

- **Without token**: 60 requests/hour
- **With token**: 5,000 requests/hour

### Data Collection

- **Runs fetched**: 100 (configurable)
- **Frequency**: Daily
- **API calls per run**: ~1 + 100 = 101 calls/day
- **Well within limits**: ✅

## Deployment Architecture

### Edge Network

```
User Request
   ↓
Cloudflare Edge (200+ locations)
   ↓
Workers Runtime (V8 isolate)
   ↓
KV Store (replicated globally)
```

### Benefits

- **Low Latency**: Data served from nearest edge location
- **High Availability**: Distributed across global network
- **Scalability**: Handles millions of requests
- **Cost Effective**: Free tier sufficient for most use cases

## Security

### API Keys

- GitHub token stored as Worker secret (encrypted)
- Not exposed in code or logs

### CORS

- Enabled for `/api/*` endpoints
- Allows frontend to call APIs from any origin

### Data Privacy

- No user data collected
- Only public GitHub Actions data
- No authentication required for viewing

## Monitoring

### Logs

```bash
wrangler tail
```

Shows:
- Cron execution logs
- API request logs
- Error messages

### Metrics

Available in Cloudflare dashboard:
- Request count
- Error rate
- CPU time
- KV operations

### Alerts

Can configure alerts for:
- High error rates
- Cron failures
- KV write failures

## Future Enhancements

### Potential Features

1. **Historical Trends**: Store daily snapshots for long-term trends
2. **Failure Notifications**: Alert when failure rate exceeds threshold
3. **Job Comparison**: Compare job performance across time periods
4. **Export Data**: Download reports as CSV/JSON
5. **Multi-Branch Support**: Track other branches beyond changeset-release/main

### Scaling Considerations

- **More Frequent Updates**: Reduce cron to hourly (still within rate limits)
- **More Data**: Increase run limit to 200+ (may need pagination)
- **Multiple Repos**: Add support for other repositories
- **Analytics**: Add D1 database for long-term storage and analytics
