import { NavLink, Outlet } from 'react-router';

export default function MainLayout() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">workers-sdk Dashboard</h1>
          <nav className="main-nav">
            <NavLink
              to="/ci-flakes"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              CI Flakes
            </NavLink>
            <NavLink
              to="/issues"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Issues
            </NavLink>
            <NavLink
              to="/prs"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Pull Requests
            </NavLink>
            <NavLink
              to="/issue-chart"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Issue Chart
            </NavLink>
            <NavLink
              to="/bus-factor"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Bus Factor
            </NavLink>
            <NavLink
              to="/issue-triage"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              Issue Triage
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p>Data sourced from GitHub API for cloudflare/workers-sdk</p>
        <p>
          <a
            href="https://github.com/petebacondarwin/workers-sdk-ci-analyzer"
            target="_blank"
            rel="noopener noreferrer"
          >
            View source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
