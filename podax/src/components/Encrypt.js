import React from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom';




function Encrypt() {



    return (
        <div>
            <HeadFrame/>
            <BackButton />
            <h1> ENCRYPT PAGE</h1>
        </div>
    )
}

export default Encrypt