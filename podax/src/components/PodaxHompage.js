import React from 'react'
import './PodaxHomepage.css'
import podax_logo from './imgs/podax_logo.png'
import encrypt_logo from './imgs/encrypted.png'
import decrypt_logo from './imgs/decrypted.png'
import help_logo from './imgs/help.png'
// import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom';


function Podax_hompage() {

    const navigate = useNavigate();
    
    function navigate_encrypt(){
        navigate('/encrypt');
    }

    function navigate_decrypt(){
        navigate('/decrypt');
    }

    function navigate_about(){
        navigate('/about');
    }




    return (
        <div className="podax_homepage_frame">


            <img src={podax_logo} className="podax_logo" alt="main_logo" />

            <div className="homepage_option_card" onClick={() => navigate_encrypt()}>
                <img src={encrypt_logo} className="encrypt_logo" alt="description of podax"/>
                <div className="homepage_option_text_frame">
                    <h1 className="homepage_option_title">Encrypt</h1>
                    <h3 className="homepage_option_desc">Secure Folders/Files</h3>
                </div>
            </div>

            <div className="homepage_option_card" onClick={() => navigate_decrypt()}>
                <img src={decrypt_logo} className="encrypt_logo" alt="decrypt logo"/>
                <div className="homepage_option_text_frame">
                    <h1 className="homepage_option_title">Decrypt</h1>
                    <h3 className="homepage_option_desc">Unlock Folders/Files</h3>
                </div>
            </div>

            <div className="homepage_option_card" onClick={() => navigate_about()}>
                <img src={help_logo} className="encrypt_logo" alt="about logo" />
                <div className="homepage_option_text_frame">
                    <h1 className="homepage_option_title">About</h1>
                    <h3 className="homepage_option_desc">Find help with Podax</h3>
                </div>
            </div>



        </div>
    )
}

export default Podax_hompage