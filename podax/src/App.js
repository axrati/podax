import './App.css';
import MainPage from './components/MainPage';
import Encrypt from './components/Encrypt';
import Decrypt from './components/Decrypt';
import About from './components/About';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

function App() {
  return (
    <Router>
      <Routes>
        <Route exact path="/" element={<MainPage/>} />
        <Route exact path="/encrypt" element={<Encrypt/>} />
        <Route exact path="/decrypt" element={<Decrypt/>} />
        <Route exact path="/about" element={<About/>} />

      </Routes>
                {/* <HeadFrame/>
                <PodaxHomepage/> */}
    </Router>
  );
}

export default App;
