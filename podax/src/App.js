import './App.css';
import MainPage from './components/MainPage';
import Encrypt from './components/Encrypt';
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";

function App() {
  return (
    <Router>
      <Routes>
        <Route exact path="/" element={<MainPage/>} />
        <Route exact path="/encrypt" element={<Encrypt/>} />

      </Routes>
                {/* <HeadFrame/>
                <PodaxHomepage/> */}
    </Router>
  );
}

export default App;
