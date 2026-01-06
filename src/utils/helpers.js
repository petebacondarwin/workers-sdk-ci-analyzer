export function calculateFlakinessScore(test) {
  let score = 0;
  
  // In-run retries contribute to flakiness
  if (test.retryCount && test.occurrences) {
    score += (test.retryCount / test.occurrences) * 50;
  }
  
  // Re-run failures contribute significantly to flakiness
  if (test.rerunCount && test.rerunOccurrences) {
    score += (test.rerunOccurrences * 30);
  }
  
  // If both detection methods found issues, it's extra concerning
  if (test.retryCount > 0 && test.rerunCount > 0) {
    score += 20;
  }
  
  return Math.min(100, Math.round(score));
}

export function calculateTrend(durations) {
  if (durations.length < 2) return 0;
  
  const mid = Math.floor(durations.length / 2);
  const firstHalf = durations.slice(0, mid);
  const secondHalf = durations.slice(mid);
  
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  return ((avgSecond - avgFirst) / avgFirst) * 100;
}

export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}m ${secs}s`;
}
