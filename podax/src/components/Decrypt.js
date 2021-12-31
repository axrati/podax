import React, {useEffect, useState} from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import ErrorMessage from './ErrorMessage'
import SuccessMessage from './SuccessMessage'
import decrypt_logo from './imgs/decrypted.png'
import './Decrypt.css'
import pass_words from './assets/pass_words.json' 
const {ipcRenderer} = window.require('electron');





function Decrypt() {



    // User Input State
    const [dfilepath_input, set_dfilepath_input] = useState('')
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



    useEffect(() => { // this hook will get called everytime when type_input has changed
        // perform some action which will get fired everytime when type_input gets updated
           console.log('Updated type: ', type_input)
        }, [type_input])

    useEffect(() => { 
        console.log('Updated filepath: ', dfilepath_input)
        ipcRenderer.send('file:dir:validator', dfilepath_input.toString())
        ipcRenderer.on('file:dir:validator:reply', function(event,reply){
            if(reply.file){
                set_type_input('file')
                set_fileclass('text_input')
            } else{
                set_type_input('invalid')
                set_fileclass('bad_text_input')
            }
        })
    }, [dfilepath_input])


    useEffect(() => { 
        console.log('Updated password: ', pass_input)
    }, [pass_input])


    useEffect(() => { 
        console.log('Updated error status: ', error_stat)
        if(error_stat){
            set_error_display("error_show")
            setTimeout(function(){ set_error_display("error_hide"); set_error_stat(false)},3000)
        }
    }, [error_stat])

    useEffect(() => { 
        console.log('Updated password: ', success_stat)
        if(success_stat){
            set_success_display('success_show')
        } else if (!success_stat){
            set_success_display('success_hide')
        }
    }, [success_stat])





    const handlefilepath = (event) => {
        set_dfilepath_input(document.getElementById('decrypt_filepath').value)
    }

    const handlepass = (event) => {
        set_pass_input(document.getElementById('decrypt_pass_input').value)
    }


    const dfile_gui_open = () => {
        ipcRenderer.send('dfileselect')
        ipcRenderer.on('dfileselect:reply', function(event,reply){
            if (reply.canceled){
                console.log("File select canceled, no update of state")
            } else {
                document.getElementById('decrypt_filepath').value = reply.filePaths[0] // multi-select diabled, this will always have a single value
                set_dfilepath_input(reply.filePaths[0])             }
        });
    }




    const decrypt_file = () => {
        console.log('decrypting...')
        if(type_input === 'invalid'){
            console.log('Invalid file/folder')
            set_error_stat(true)
            set_error_text("Invalid file path")
            // Show error message
        } else if (type_input ==="file"){
            // Straight forward encryption
            ipcRenderer.send('decrypt:file', {"file_path":dfilepath_input, "pass":pass_input} )
            ipcRenderer.on('decrypt:file:reply', function(event,reply){
                if (reply.success){
                    set_success_text(reply.location)
                    set_success_stat(true)
                } else {
                    set_error_text("Failed decryption - check file & key")
                    set_error_stat(true)
                }
            })
        }
         else if (type_input === "dir"){
            // Complex deconstruction of sub_folders and files
            console.log('Folder, not file')
            set_error_stat(true)
            set_error_text("Provide link to FILE not FOLDER")

         }
    }




    return (
        <div>
            <HeadFrame/>
            <BackButton />

            <ErrorMessage error_text={error_text} error_display={error_display} />
            <SuccessMessage success_text={success_text} success_display={success_display} set_success_stat={set_success_stat} />

            <img src={decrypt_logo} className="decrypt_page_logo" alt="decrypt logo on decrypt page"/>
        
            <div className="decrypt_page_form_frame">

                    <div className="decrypt_form_fileselect">
                        <h3 className="decrypt_form_title">Select File to decrypt</h3>
                        <div className="select_file_gui" onClick={() => dfile_gui_open()}>File GUI</div>
                    </div>
                    
                    <input id="decrypt_filepath" type="text" className={fileclass} onChange={(event) => handlefilepath()} />
                    <h5 className='input_subtext'>Path of the encrypted file... Folders that were encrypted will decompress from the single file</h5>


                    <div className="decrypt_form_fileselect">
                        <h3 className="decrypt_form_title">Enter the encrypted file key</h3>
                    </div>

                    <input id="decrypt_pass_input" type="text" className="pass_text_input"  onChange={(event) => handlepass()} />
                    <h5 className='input_subtext'>The key used to encrypt the data. There is no recovery process for this attribute.</h5>


                    <div className='execution_button' onClick={()=> decrypt_file()}>
                        <h5 className='execution_text'>DECRYPT</h5>
                    </div>

            </div>



        </div>
    )
}

export default Decrypt
