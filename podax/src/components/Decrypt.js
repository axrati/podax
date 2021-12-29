import React, {useEffect, useState} from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import ErrorMessage from './ErrorMessage'
import SuccessMessage from './SuccessMessage'
import encrypt_logo from './imgs/encrypted.png'
import './Decrypt.css'
import pass_words from './assets/pass_words.json' 
const {ipcRenderer} = window.require('electron');





function Decrypt() {



    // User Input State
    const [filepath_input, set_filepath_input] = useState('')
    const [pass_input, set_pass_input] = useState('')
    const [type_input, set_type_input] = useState('')
    const [fileclass, set_fileclass] = useState("text_input")

    // Error Messaging State
    const [error_stat, set_error_stat] = useState(false)
    const [error_text, set_error_text] = useState('')
    const [error_display, set_error_display] = useState("error_hide")

    // Success Messaging State
    const [success_stat, set_success_stat] = useState(false)
    const [success_text, set_success_text] = useState('')
    const [success_display, set_success_display] = useState("success_hide")




    const handlefilepath = (event) => {
        set_filepath_input(document.getElementById('decrypt_filepath').value)
    }

    const handlepass = (event) => {
        set_pass_input(document.getElementById('pass_input').value)
    }


    const file_gui_open = () => {
        ipcRenderer.send('encrypt:fileselect')
        ipcRenderer.on('encrypt:fileselect:reply', function(event,reply){
            if (reply.canceled){
                console.log("File select canceled, no update of state")
            } else {
                document.getElementById('decrypt_filepath').value = reply.filePaths[0] // multi-select diabled, this will always have a single value

                set_filepath_input(reply.filePaths[0])             }
        });
    }


    const folder_gui_open = () => {
        ipcRenderer.send('encrypt:folderselect')
        ipcRenderer.on('encrypt:folderselect:reply', function(event,reply){
            if (reply.canceled){
                console.log("Folder select canceled, no update of state")
            } else {
                document.getElementById('decrypt_filepath').value = reply.filePaths[0] // multi-select diabled, this will always have a single value

                set_filepath_input(reply.filePaths[0])             }
        });
    }

    const decrypt_file = () => {
        console.log('decrypting...')
    }




    return (
        <div>
            <HeadFrame/>
            <BackButton />

            <ErrorMessage error_text={error_text} error_display={error_display} />
            <SuccessMessage success_text={success_text} success_display={success_display} set_success_stat={set_success_stat} />

            <img src={encrypt_logo} className="decrypt_page_logo" alt="decrypt logo on decrypt page"/>
        
            <div className="decrypt_page_form_frame">

                    <div className="decrypt_form_fileselect">
                        <h3 className="decrypt_form_title">Select Files/Folders</h3>
                        <div className="select_file_gui" onClick={() => file_gui_open()}>File GUI</div>
                        <div className="select_file_gui" onClick={() => folder_gui_open()}>Folder GUI</div>
                    </div>
                    
                    <input id="decrypt_filepath" type="text" className={fileclass} onChange={(event) => handlefilepath()} />
                    <h5 className='input_subtext'>File/Folder path... Folders will have the entirety of their contents decrypted</h5>


                    <div className="decrypt_form_fileselect">
                        <h3 className="decrypt_form_title">Enter a custom key/password</h3>
                    </div>

                    <input id="pass_input" type="text" className="pass_text_input"  onChange={(event) => handlepass()} />
                    <h5 className='input_subtext'>Please write this down, there is no recovery process... Randomized passwords recommended.</h5>


                    <div className='execution_button' onClick={()=> decrypt_file()}>
                        <h5 className='execution_text'>DECRYPT</h5>
                    </div>

            </div>



        </div>
    )
}

export default Decrypt
