import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/flaky" element={<Dashboard defaultTab="flaky" />} />
      <Route path="/failures" element={<Dashboard defaultTab="failures" />} />
      <Route path="/durations" element={<Dashboard defaultTab="durations" />} />
      <Route path="/trends" element={<Dashboard defaultTab="trends" />} />
    </Routes>
  );
}

export default App;
