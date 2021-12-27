import React from 'react'
import './SuccessMessage.css'
import { useNavigate } from "react-router-dom";

function SuccessMessage(props) {

    let navigate = useNavigate()

    const closeSuccessButton = () => {
        console.log('close success message')
        props.set_success_stat(false)
        navigate('/')
    }

    return (
        <div className={props.success_display}>

            <h1 className='success_title'>Success</h1>

            <h3 className='success_desc1'>Your data is located at: </h3>
            <h3 className='success_filepath'>{props.success_text}</h3>

            <h5 className='success_desc2'>For encrypted files, delete your originals and change the podax filename and extension for further obfuscation.</h5>
            <h5 className='success_desc3'>For decrypted files, you can keep the encrypted version as long as you don't want to save any changes to the output.</h5>
            <div className='success_close_btn' onClick={() => closeSuccessButton()}>
                <h3 className='success_close_btn_text'>CLOSE</h3>
            </div>
        </div>
    )
}

export default SuccessMessage
