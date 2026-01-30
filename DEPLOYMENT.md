# Deployment Guide

## Overview

This application is deployed to **Cloudflare Workers** via **GitLab CI/CD**.

**Account**: Workers Authoring & Testing "experiments" account  
**Account ID**: `f7f78ebb28c2a224a9a46a3007350b7a`  
**Repository**: [gitlab.cfdata.org/cloudflare/ew/workers-authoring-and-testing/workers-sdk-ci-analyzer](https://gitlab.cfdata.org/cloudflare/ew/workers-authoring-and-testing/workers-sdk-ci-analyzer)

### Key Components

- **KV Storage**: Stores CI data fetched from GitHub API
- **Cron Trigger**: Automatically refreshes data (daily at 6 AM UTC for CI data, hourly for issues/PRs)
- **React Router 7**: SSR-enabled React application

## GitLab CI/CD Pipeline

Deployments are **automated** via GitLab CI when changes are merged to `main`.

### Pipeline Stages

| Stage | Job | Description | Runs On |
|-------|-----|-------------|---------|
| test | `wrangler2-test` | Runs tests and type checking | All branches & MRs |
| test | `wrangler2-publish-dryrun` | Validates deployment will succeed | All branches & MRs |
| publish | `wrangler2-publish` | Deploys to Cloudflare Workers | `main` branch only |

### Required CI/CD Variables

Set these in GitLab: **Settings → CI/CD → Variables**

| Variable | Description | Flags |
|----------|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions | Protected, Masked |
| `CLOUDFLARE_ACCOUNT_ID` | `f7f78ebb28c2a224a9a46a3007350b7a` | Protected |

### Creating the Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/f7f78ebb28c2a224a9a46a3007350b7a) → Manage Account → API Tokens
2. Click "Create Token"
3. Use "Custom token" with these permissions:
   - **Account > Workers Scripts**: Edit
   - **Account > Workers KV Storage**: Edit
   - **Account > Account Settings**: Read
4. Restrict to the experiments account
5. Copy the token and add it to GitLab CI variables

## Initial Setup (First Deployment)

### 1. Set Up GitLab CI Variables

Add the required variables as described above.

### 2. Push to Main Branch

The first push to `main` will:
- Build the React application
- Automatically create the KV namespace `CI_DATA_KV`
- Deploy the Worker with cron triggers

### 3. Set the GITHUB_TOKEN Secret

After the first deployment, set the GitHub token as a Worker secret:

```bash
wrangler secret put GITHUB_TOKEN
```

Paste your GitHub Personal Access Token when prompted.

**To create a GitHub token:**
1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select the following scopes:
   - `public_repo` - Read access to public repositories
   - `read:org` - Read organization membership (for Bus Factor analysis)
   - `read:project` - Read access to organization projects (for Issue Triage)
4. Copy the token

### 4. Trigger Initial Data Fetch

After deployment, trigger the data fetch manually:

```bash
curl -X POST https://workers-sdk-ci-analyzer.<subdomain>.workers.dev/api/refresh
```

Or visit the Worker URL - the first request will trigger a fetch if KV is empty.

## Local Development

### Prerequisites

- Node.js v20 or later
- npm
- Wrangler CLI (`npm install -g wrangler`)
- Access to the experiments account (`wrangler login`)

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment template:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Edit `.dev.vars` and add your GitHub token

4. Run the development server:
   ```bash
   npm run dev
   ```

### Using Remote KV Data

To use the production KV data locally:

1. Get the KV namespace ID:
   ```bash
   wrangler kv:namespace list
   ```

2. Add the ID to `wrangler.jsonc`:
   ```jsonc
   "kv_namespaces": [
     {
       "binding": "CI_DATA_KV",
       "id": "<KV_NAMESPACE_ID>"
     }
   ]
   ```

3. Run with remote bindings:
   ```bash
   npm run dev
   ```

## Manual Deployment

> **Note**: Production deployments should go through GitLab CI. Manual deployment is for emergency situations only.

```bash
# Ensure you're logged in to the correct account
wrangler whoami

# Deploy
npm run deploy
```

## Data Flow

### Cron Jobs

1. **CI Data (Daily at 6 AM UTC)**
   - Worker's `scheduled()` handler runs
   - Fetches last 100 workflow runs from `changeset-release/main` branch
   - Processes job statistics (failure rates, 7-day rolling averages)
   - Stores processed data in KV with 7-day TTL

2. **GitHub Items (Hourly)**
   - Syncs issues and PRs from the workers-sdk repository
   - Weekly reconciliation on Sundays to remove stale items

### Website Requests

1. User visits the dashboard
2. Frontend calls `/api/ci-data`
3. Worker reads from KV cache (fast!)
4. Fallback to fresh fetch if KV is empty

### Manual Refresh

POST to `/api/refresh` to force a data refresh:

```bash
curl -X POST https://workers-sdk-ci-analyzer.<subdomain>.workers.dev/api/refresh
```

## Monitoring

### View Logs

```bash
wrangler tail
```

### Check KV Data

```bash
wrangler kv:key get --binding=CI_DATA_KV ci-data
```

### Check Cron Status

View in Cloudflare Dashboard: Workers & Pages → workers-sdk-ci-analyzer → Triggers

## KV Storage Structure

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

Current schedules in `wrangler.jsonc`:
- `0 6 * * *` - CI data sync (6 AM UTC daily)
- `0 * * * *` - GitHub items sync (hourly)

Common cron patterns:
- `0 * * * *` - Every hour
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight UTC
- `0 6 * * *` - Daily at 6 AM UTC

## Troubleshooting

### Pipeline Fails at Test Stage

1. Check the job logs in GitLab
2. Ensure Node.js version is compatible (v20)
3. Run tests locally: `npm test` (if test script exists) or `npm run typecheck`

### Pipeline Fails at Publish Stage

1. Verify CI/CD variables are set correctly
2. Check the API token has correct permissions
3. Ensure account ID is correct

### "KV namespace not found"

The KV namespace is auto-provisioned on first deployment. If it's missing:
1. Check the Cloudflare Dashboard for KV namespaces
2. Redeploy to trigger auto-provisioning

### "No data available" on Dashboard

1. Check if GITHUB_TOKEN secret is set:
   ```bash
   wrangler secret list
   ```
2. Manually trigger refresh:
   ```bash
   curl -X POST https://workers-sdk-ci-analyzer.<subdomain>.workers.dev/api/refresh
   ```
3. Check logs for errors: `wrangler tail`

### "GitHub API rate limit exceeded"

Ensure GITHUB_TOKEN is set as a Worker secret. Without a token, you're limited to 60 requests/hour.

## Cost Estimation

With Cloudflare Workers free tier:
- **Requests**: 100,000/day (plenty for a dashboard)
- **KV Storage**: 1 GB (we use < 1 MB)
- **KV Reads**: 100,000/day (one per page visit)
- **KV Writes**: 1,000/day (one per cron job = ~25/day)
- **Cron Triggers**: Included

**Expected cost**: $0/month (within free tier)

## Security

- Cloudflare API token stored as GitLab CI variable (masked)
- GitHub token stored as Worker secret (encrypted)
- No sensitive data in repository or KV storage
- CORS enabled for API endpoints

## Future: Terraform-Managed Tokens

For production maturity, consider migrating to Terraform-managed API tokens:

1. Create a PR to `OPS/terraform-cfaccounts` with:
   ```hcl
   module "workers-sdk-ci-analyzer-gitlab-api-token" {
     source     = "./wrangler-deploy"
     account_id = "f7f78ebb28c2a224a9a46a3007350b7a"
     name       = "workers-sdk-ci-analyzer-gitlab-api-token"
     kv_path    = "kv/gitlab/cloudflare/ew/workers-authoring-and-testing/workers-sdk-ci-analyzer/_branch/main/_terraform_atlantis/wrangler-cloudflare-api-token"
   }
   ```

2. Update `.gitlab-ci.yml` to use Vault path instead of CI variables

See [GitLab CI Component Docs](https://backstage.cfdata.org/docs/default/component/gitlab-ci-component-docs/migration/workers/) for details.
