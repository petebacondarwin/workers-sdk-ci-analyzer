# Workers SDK CI Analyzer

A comprehensive dashboard for analyzing CI health, test flakiness, and performance metrics for the [cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk) repository.

## Features

- **Advanced Flaky Tests Detection**: 
  - Detects in-run retries (tests that needed multiple attempts within a single workflow run)
  - Identifies workflow re-runs (where a failed workflow was manually re-run and then passed)
  - Shows which commits had flaky test patterns
  - Links to specific failed and successful runs for investigation
- **Failure Rate Analysis**: Shows which jobs and tests fail most frequently
- **Task Duration Tracking**: Displays the longest-running turbo tasks
- **Trend Analysis**: Visualizes how these metrics change over time with interactive charts
- **Real-time Data**: Fetches fresh data from GitHub Actions API

## Architecture

This project is built for **Cloudflare Workers with Assets**, combining:
- **Worker Script** (`src/index.js`): Proxies and processes GitHub API requests
- **Static Assets** (`public/`): HTML, CSS, and JavaScript for the dashboard UI

## Setup

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Wrangler CLI

### Installation

1. Install dependencies:
```bash
npm install
```

2. (Optional) Configure a GitHub token for higher rate limits:
   - Create a GitHub Personal Access Token with `repo` scope
   - Add it to your `wrangler.jsonc`:
   ```jsonc
   {
     "vars": {
       "GITHUB_TOKEN": "your_token_here"
     }
   }
   ```
   Or set it as a secret (recommended):
   ```bash
   wrangler secret put GITHUB_TOKEN
   ```

### Development

Run the development server:
```bash
npm run dev
```

This will start a local server at `http://localhost:8787`

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Usage

1. Open the dashboard in your browser
2. Select the number of workflow runs to analyze (20, 50, or 100)
3. Click "Refresh Data" to fetch the latest CI data
4. Navigate between tabs to view different metrics:
   - **Flaky Tests**: Tests that needed retries
   - **Failure Rates**: Most frequently failing jobs
   - **Task Durations**: Longest-running tasks
   - **Trends**: Historical charts showing metric changes over time

## How It Works

### Data Collection

The Worker script fetches data from the GitHub Actions API:
1. Retrieves recent workflow runs for the CI workflow
2. For each run, fetches detailed job information
3. Analyzes job steps to detect retries and failures
4. Groups runs by commit SHA to detect re-run patterns
5. Calculates durations for each task

### Flaky Test Detection Methods

The analyzer uses two sophisticated methods to identify flaky tests:

1. **In-Run Retry Detection**
   - Detects when a test step includes "retry" or "attempt" keywords
   - Identifies Vitest and e2e tests that needed multiple attempts within a single workflow run
   - Tracks how many times each test was retried

2. **Workflow Re-Run Detection** (NEW!)
   - Groups workflow runs by commit SHA
   - Identifies cases where a job failed in one run but passed when the workflow was manually re-run
   - Tracks which specific jobs are flaky across re-runs
   - Shows the exact failed and successful run numbers for investigation

### Metrics Calculated

- **Flakiness Score**: Composite score based on:
  - In-run retry count and frequency (contributes up to 50%)
  - Workflow re-run failures (contributes up to 30% per occurrence)
  - Bonus penalty if both detection methods find issues (+20%)
- **Failure Rate**: Percentage of runs that failed for each job
- **Duration Trends**: Compares recent durations to historical averages
- **Time Series**: Tracks metrics across workflow runs

## API Endpoints

The Worker exposes several API endpoints:

- `GET /api/ci-data?limit=50` - Processed CI metrics and analysis
- `GET /api/workflow-runs?limit=50` - Raw workflow run data
- `GET /api/job-logs?job_id=12345` - Logs for a specific job

## Rate Limits

GitHub API rate limits:
- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour

Configure a GitHub token (see Setup) for higher limits.

## Project Structure

```
workers-sdk-ci-analyzer/
├── src/
│   └── index.js          # Worker script with API handlers
├── public/
│   ├── index.html        # Dashboard UI
│   ├── styles.css        # Styling
│   └── app.js            # Client-side JavaScript
├── wrangler.jsonc        # Cloudflare Workers configuration
├── package.json
└── README.md
```

## Technologies Used

- **Cloudflare Workers**: Serverless compute platform
- **GitHub Actions API**: Source of CI data
- **Chart.js**: Interactive time-series graphs
- **Vanilla JavaScript**: Client-side interactivity (no frameworks)

## Future Enhancements

- Add filtering by date range
- Export data to CSV/JSON
- Webhook integration for real-time updates
- Historical data persistence with Cloudflare D1
- Notifications for flaky test detection
- Comparison between branches
- Integration with Slack/Discord for alerts

## License

MIT
