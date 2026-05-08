import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { Home } from './pages/Home.js';
import { County } from './pages/County.js';
import { Compare } from './pages/Compare.js';
import { Counties } from './pages/Counties.js';
import { Methodology } from './pages/Methodology.js';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/county/:fips" element={<County />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/counties" element={<Counties />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route
          path="*"
          element={
            <div className="p-8 text-center text-neutral-500">Page not found</div>
          }
        />
      </Route>
    </Routes>
  );
}
