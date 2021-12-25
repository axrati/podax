import React, {useEffect, useState} from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import encrypt_logo from './imgs/encrypted.png'
import './Encrypt.css'
const {ipcRenderer} = window.require('electron');





function Encrypt() {

    const [filepath_input, set_filepath_input] = useState([])
    const [pass_input, set_pass_input] = useState([])
    const [type_input, set_type_input] = useState([])




    const verify_type = (event) => {
        ipcRenderer.send('file:dir:validator', filepath_input.toString())
        ipcRenderer.on('file:dir:validator:reply', function(event,reply){
            if(reply.file){
                set_type_input('file')
            } else if(reply.dir){
                set_type_input('dir')
            } else{
                set_type_input('invalid')
            }
        });
    }

    const encrypt_file = (event) => {
        verify_type()
        if(type_input === 'invalid'){
            console.log('Invalid file/folder')
        } else {
            console.log(type_input)
        }
    }


    const handlefilepath = (event) => {
        set_filepath_input(document.getElementById('encrypt_filepath').value)
    }

    const handlepass = (event) => {
        set_pass_input(document.getElementById('pass_input').value)
    }


    const file_gui_open = () => {

        console.log(`
        
        filepath_input: ${filepath_input}
        pass_input: ${pass_input}
        
        `)

        ipcRenderer.send('encrypt:fileselect')

        ipcRenderer.on('encrypt:fileselect:reply', function(event,reply){
            console.log(reply)
            if (reply.cancelled){
                console.log("File select canceled, no update of state")
            } else {

            }
        });

    }


    return (
        <div>
            <HeadFrame/>
            <BackButton />
            <img src={encrypt_logo} className="encrypt_page_logo" alt="Encrypt logo on encrypt page"/>
        
            <div className="encrypt_page_form_frame">

                    <div className="encrypt_form_fileselect">
                        <h3 className="encrypt_form_title">Select Files/Folders</h3>
                        <div className="select_file_gui" onClick={() => file_gui_open()}>GUI</div>
                    </div>
                    <input id="encrypt_filepath" type="text" className="text_input"  onChange={(event) => handlefilepath()} />
                    <h5 className='input_subtext'>Path</h5>


                    <div className="encrypt_form_fileselect">
                        <h3 className="encrypt_form_title">Enter a custom key/password</h3>
                    </div>
                    <input id="pass_input" type="text" className="text_input"  onChange={(event) => handlepass()} />
                    <h5 className='input_subtext'>We recommend a multiple word & special character password</h5>


                    <div className='execution_button' onClick={()=> encrypt_file()}>
                        <h5 className='execution_text'>ENCRYPT</h5>
                    </div>

            </div>



        </div>
    )
}

export default Encrypt
