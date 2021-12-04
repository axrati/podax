import React from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom';




function Encrypt() {

    const navigate = useNavigate();
    
    function navigate_home(){
        navigate('/');
    }

    return (
        <div>
            <HeadFrame/>
            <BackButton onClick={() => navigate_home()}  />
            <h1> WUSSUP SUCKAAA</h1>
        </div>
    )
}

export default Encrypt
