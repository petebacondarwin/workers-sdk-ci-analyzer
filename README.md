# Workers SDK CI Analyzer

A comprehensive dashboard for analyzing CI health, test flakiness, and performance metrics for the [cloudflare/workers-sdk](https://github.com/cloudflare/workers-sdk) repository.

Built with React, React Router, and Vite, deployed to Cloudflare Workers using the `@cloudflare/vite-plugin`.

## Features

- **Advanced Flaky Tests Detection**: 
  - Detects in-run retries (tests that needed multiple attempts within a single workflow run)
  - Identifies workflow re-runs (where a failed workflow was manually re-run and then passed)
  - Shows which commits had flaky test patterns
  - Links to specific failed and successful runs for investigation
- **Failure Rate Analysis**: Shows which jobs and tests fail most frequently
- **Task Duration Tracking**: Displays the longest-running turbo tasks
- **Trend Analysis**: Visualizes how these metrics change over time with interactive Chart.js graphs
- **Real-time Data**: Fetches fresh data from GitHub Actions API
- **Client-Side Routing**: React Router for smooth navigation between views

## Architecture

This project is built for **Cloudflare Workers** using modern web technologies:

- **Frontend**: React 18 with React Router for navigation
- **Build Tool**: Vite 6 for fast development and optimized production builds
- **Deployment**: `@cloudflare/vite-plugin` for seamless Cloudflare Workers integration
- **API Functions**: File-based routing in the `functions/` directory
- **Charts**: Chart.js with react-chartjs-2 for interactive visualizations

## Project Structure

```
workers-sdk-ci-analyzer/
├── functions/              # Cloudflare Workers API endpoints
│   └── api/
│       ├── ci-data.js      # Main CI metrics endpoint
│       ├── workflow-runs.js # Workflow data endpoint
│       └── job-logs.js     # Job logs endpoint
├── src/
│   ├── components/         # React components
│   │   ├── Header.jsx
│   │   ├── Tabs.jsx
│   │   ├── FlakyTestsView.jsx
│   │   ├── FailureRatesView.jsx
│   │   ├── DurationsView.jsx
│   │   └── TrendsView.jsx
│   ├── pages/
│   │   └── Dashboard.jsx   # Main dashboard page
│   ├── hooks/
│   │   └── useCIData.js    # Custom hook for data fetching
│   ├── utils/
│   │   └── helpers.js      # Utility functions
│   ├── App.jsx             # Main app with routes
│   ├── main.jsx            # React entry point
│   └── index.css           # Global styles
├── index.html              # HTML entry point
├── vite.config.js          # Vite configuration
├── wrangler.jsonc          # Cloudflare Workers configuration
└── package.json
```

## Setup

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

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

Run the development server with hot module reloading:
```bash
npm run dev
```

This will start a local server at `http://localhost:5173` (or another port if 5173 is in use).

The Cloudflare Vite plugin will automatically handle:
- Serving your React application
- Running Worker functions locally
- Hot module replacement for instant updates

### Building

Build for production:
```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

Or manually:
```bash
npm run build
wrangler deploy
```

## Usage

1. Open the dashboard in your browser
2. Select the number of workflow runs to analyze (20, 50, or 100)
3. Click "Refresh Data" to fetch the latest CI data
4. Navigate between views using:
   - The tab buttons
   - Direct URLs: `/`, `/flaky`, `/failures`, `/durations`, `/trends`
   - Browser back/forward buttons

## How It Works

### Data Collection

The Worker functions fetch data from the GitHub Actions API:
1. Retrieve recent workflow runs **across ALL workflows** in the repository (not just a specific workflow)
2. For each run, fetch detailed job information
3. Analyze job steps to detect retries and failures
4. Group runs by commit SHA to detect re-run patterns
5. Calculate durations for each task

This means the dashboard analyzes all CI activity including:
- Main CI workflow
- Pull request checks
- Release workflows
- Any other GitHub Actions workflows in the repository

### Flaky Test Detection Methods

The analyzer uses two sophisticated methods to identify flaky tests:

1. **In-Run Retry Detection**
   - Detects when a test step includes "retry" or "attempt" keywords
   - Identifies Vitest and e2e tests that needed multiple attempts within a single workflow run
   - Tracks how many times each test was retried

2. **Workflow Re-Run Detection**
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

The Worker exposes several API endpoints via file-based routing:

- `GET /api/ci-data?limit=50` - Processed CI metrics and analysis
- `GET /api/workflow-runs?limit=50` - Raw workflow run data
- `GET /api/job-logs?job_id=12345` - Logs for a specific job

## Rate Limits

GitHub API rate limits:
- **Unauthenticated**: 60 requests/hour
- **Authenticated**: 5,000 requests/hour

Configure a GitHub token (see Setup) for higher limits.

## Technologies Used

- **React 18**: Modern UI library with hooks
- **React Router 6**: Client-side routing
- **Vite 6**: Lightning-fast build tool
- **@cloudflare/vite-plugin**: Seamless Cloudflare Workers integration
- **Cloudflare Workers**: Serverless compute platform
- **GitHub Actions API**: Source of CI data
- **Chart.js + react-chartjs-2**: Interactive time-series graphs

## Development Tips

### Hot Module Replacement

Vite provides instant HMR during development. Changes to React components, styles, or logic will update instantly without losing application state.

### Debugging Worker Functions

Use `wrangler tail` to view logs from your deployed Worker:
```bash
wrangler tail
```

Or check logs in the Cloudflare Dashboard.

### Adding New Routes

1. Add a route in `src/App.jsx`
2. Create the page component in `src/pages/`
3. Update the navigation in `src/components/Tabs.jsx`

### Adding New API Endpoints

1. Create a new file in `functions/api/`
2. Export an `onRequest` function
3. The file path determines the URL (e.g., `functions/api/example.js` → `/api/example`)

## Future Enhancements

- Add filtering by date range
- Export data to CSV/JSON
- Webhook integration for real-time updates
- Historical data persistence with Cloudflare D1
- Notifications for flaky test detection
- Comparison between branches
- Integration with Slack/Discord for alerts
- Test-specific detail pages

## License

MIT
