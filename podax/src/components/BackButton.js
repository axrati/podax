import React from 'react'
import './BackButton.css'
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom';


function BackButton() {

    const navigate = useNavigate();
    
    function navigate_home(){
        navigate('/');
    }

    return (
        <div className="back_button" onClick={() => navigate_home()}>
            {"<"}
        </div>
    )
}

export default BackButton
