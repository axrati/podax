import React from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom';

function About() {
    return (
        <div>
            <HeadFrame/>
            <BackButton />
            <h1> ABOUT PAGE</h1>
        </div>
    )
}

export default About
