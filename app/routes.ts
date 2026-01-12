import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  // Root index redirects to /ci-flakes
  index("routes/home.tsx"),
  
  // Main layout with tab navigation
  layout("routes/layout.tsx", [
    route("ci-flakes", "routes/ci-flakes.tsx"),
    route("issues", "routes/issues.tsx"),
    route("prs", "routes/prs.tsx"),
    route("issue-chart", "routes/issue-chart.tsx"),
    route("bus-factor", "routes/bus-factor.tsx"),
    route("issue-triage", "routes/issue-triage.tsx"),
  ]),
] satisfies RouteConfig;
