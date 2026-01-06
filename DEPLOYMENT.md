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

Visit `http://localhost:5173` to see the dashboard. The Vite dev server provides hot module replacement for instant updates.

### 3. Deploy to Cloudflare Workers

```bash
npm run deploy
```

This will build your React app and deploy it to Cloudflare Workers.

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

Edit `functions/api/ci-data.js` and `functions/api/workflow-runs.js` to change the repository owner/name:

```javascript
// Change this line in both files:
`https://api.github.com/repos/cloudflare/workers-sdk/actions/runs?per_page=${limit}`

// To:
`https://api.github.com/repos/YOUR_OWNER/YOUR_REPO/actions/runs?per_page=${limit}`
```

The dashboard automatically analyzes **all workflows** in the repository, so you don't need to specify individual workflow IDs.

### Adjusting Cache Duration

In the API functions (`functions/api/*.js`), modify the `Cache-Control` header:

```javascript
'Cache-Control': 'public, max-age=300' // 5 minutes (300 seconds)
```

### Customizing the UI

- **Colors**: Edit CSS variables in `src/index.css` under `:root`
- **Chart Colors**: Modify the `colors` array in `src/components/TrendsView.jsx`
- **Table Columns**: Edit the component files in `src/components/`

## Build Configuration

### Vite Configuration

The `vite.config.js` file configures the build:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    cloudflare({
      configPath: './wrangler.jsonc',
    }),
  ],
});
```

### Wrangler Configuration

The `wrangler.jsonc` file configures Cloudflare Workers:

```jsonc
{
  "name": "workers-sdk-ci-analyzer",
  "compatibility_date": "2024-01-01"
}
```

## Troubleshooting

### Rate Limit Errors

If you see "API rate limit exceeded":
1. Add a GitHub token (see above)
2. Reduce the number of runs analyzed (use 20 instead of 50/100)
3. Wait for the rate limit to reset (shown in error message)

### Build Errors

If you encounter build errors:

1. Clear node_modules and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

2. Clear Vite cache:
```bash
rm -rf .vite
```

3. Check that all dependencies are compatible with Vite 6

### Development Server Issues

If `npm run dev` fails to start:

1. Check that port 5173 is available
2. Try a different port:
```bash
vite dev --port 3000
```

### Worker Function Errors

If API endpoints aren't working:

1. Check the browser console for errors
2. Verify the function file paths match the URL structure
3. Check that `onRequest` is properly exported
4. Use `wrangler tail` to see Worker logs

### Deployment Failures

If deployment fails:

1. Ensure you're logged in to Wrangler:
```bash
wrangler login
```

2. Check your account has Workers enabled

3. Verify `wrangler.jsonc` is valid JSON with comments

4. Try deploying manually:
```bash
npm run build
wrangler deploy
```

## Monitoring

### View Live Logs

```bash
wrangler tail
```

This shows real-time logs from your deployed Worker, including:
- API requests
- Errors
- Console logs from functions

### Check Deployment Status

```bash
wrangler deployments list
```

### View Worker Analytics

Visit the Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select your worker
3. View analytics, logs, and performance metrics

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

3. Configure DNS in Cloudflare Dashboard:
   - Add a CNAME record pointing to your Worker
   - Or use a Cloudflare-managed custom domain

## Performance Tips

1. **Enable Caching**: API responses are cached for 5 minutes by default
2. **Reduce Data**: Analyze fewer runs (20-50) for faster loading
3. **GitHub Token**: Always use a token to avoid rate limit delays
4. **CDN**: Cloudflare automatically caches static assets globally
5. **Code Splitting**: Vite automatically splits code for optimal loading

## Security Notes

- Never commit `.dev.vars` or tokens to git (already in `.gitignore`)
- Use Wrangler secrets for production
- Rotate tokens regularly
- Use tokens with minimal required scopes
- Keep dependencies updated

## Updating

To update the dashboard:

1. Make changes to files in `src/`, `functions/`, or styles
2. Test locally: `npm run dev`
3. Build: `npm run build` (optional - deploy does this automatically)
4. Deploy: `npm run deploy`

Changes are live immediately after deployment!

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install
      
      - run: npm run build
      
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
```

Add `CLOUDFLARE_API_TOKEN` to your repository secrets.

## Advanced Configuration

### Environment-Specific Builds

You can create different configurations for staging and production:

1. Create `wrangler.staging.jsonc` and `wrangler.production.jsonc`

2. Update package.json:
```json
{
  "scripts": {
    "deploy:staging": "vite build && wrangler deploy --config wrangler.staging.jsonc",
    "deploy:production": "vite build && wrangler deploy --config wrangler.production.jsonc"
  }
}
```

### Adding More API Endpoints

File-based routing makes it easy:

1. Create `functions/api/new-endpoint.js`:
```javascript
export async function onRequest(context) {
  const { request, env } = context;
  // Your logic here
  return new Response(JSON.stringify({ data: 'value' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

2. Access at `/api/new-endpoint`

### Using Cloudflare D1 for Persistence

To store historical data:

1. Create a D1 database:
```bash
wrangler d1 create ci-analyzer-db
```

2. Add to `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ci-analyzer-db",
      "database_id": "your-database-id"
    }
  ]
}
```

3. Access in functions via `context.env.DB`
