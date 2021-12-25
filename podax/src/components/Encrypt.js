import React, {useEffect, useState} from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import encrypt_logo from './imgs/encrypted.png'
import './Encrypt.css'


function Encrypt() {

    const [filepath_input, set_filepath_input] = useState([])
    const [pass_input, set_pass_input] = useState([])

    const handlefilepath = (event) => {
        set_filepath_input(document.getElementById('encrypt_filepath').value)
        console.log(filepath_input)
    }

    const handlepass = (event) => {
        set_pass_input(document.getElementById('pass_input').value)
        console.log(pass_input)
    }


    const checkstate = () => {
        console.log(`
        
        filepath_input: ${filepath_input}
        pass_input: ${pass_input}
        
        `)

    }


    return (
        <div>
            <HeadFrame/>
            <BackButton />
            <img src={encrypt_logo} className="encrypt_page_logo" alt="Encrypt logo on encrypt page"/>
        
            <div className="encrypt_page_form_frame">

                    <div className="encrypt_form_fileselect">
                        <h3 className="encrypt_form_title">Select File/Folder</h3>
                        <div className="select_file_gui" onClick={() => checkstate()}>GUI</div>
                    </div>
                    <input id="encrypt_filepath" type="text" className="text_input"  onChange={(event) => handlefilepath()} />
                    <h5 className='input_subtext'>Path</h5>


                    <div className="encrypt_form_fileselect">
                        <h3 className="encrypt_form_title">Enter a custom key/password</h3>
                    </div>
                    <input id="pass_input" type="text" className="text_input"  onChange={(event) => handlepass()} />
                    <h5 className='input_subtext'>We recommend a multiple word & special character password</h5>


                    <div className='execution_button'>
                        <h5 className='execution_text'>ENCRYPT</h5>
                    </div>

            </div>



        </div>
    )
}

export default Encrypt
