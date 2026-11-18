import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import About from './components/About.jsx';
import Decrypt from './components/Decrypt.jsx';
import Encrypt from './components/Encrypt.jsx';
import Home from './components/Home.jsx';
import './App.css';

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/encrypt" element={<Encrypt />} />
          <Route path="/decrypt" element={<Decrypt />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
