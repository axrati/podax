import React, {useEffect, useState} from 'react'
import BackButton from './BackButton'
import HeadFrame from './HeadFrame'
import ErrorMessage from './ErrorMessage'
import SuccessMessage from './SuccessMessage'
import encrypt_logo from './imgs/encrypted.png'
import './Encrypt.css'
import pass_words from './assets/pass_words.json' 
const {ipcRenderer} = window.require('electron');





function Encrypt() {

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

    useEffect(() => { // this hook will get called everytime when type_input has changed
        // perform some action which will get fired everytime when type_input gets updated
           console.log('Updated type: ', type_input)
        }, [type_input])

    useEffect(() => { 
        console.log('Updated filepath: ', filepath_input)
        ipcRenderer.send('file:dir:validator', filepath_input.toString())
        ipcRenderer.on('file:dir:validator:reply', function(event,reply){
            if(reply.file){
                set_type_input('file')
                set_fileclass('text_input')
            } else if(reply.dir){
                set_type_input('dir')
                set_fileclass('text_input')
            } else{
                set_type_input('invalid')
                set_fileclass('bad_text_input')
            }
        })
    }, [filepath_input])


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
        set_filepath_input(document.getElementById('encrypt_filepath').value)
    }

    const handlepass = (event) => {
        set_pass_input(document.getElementById('encrypt_pass_input').value)
    }


    const file_gui_open = () => {
        ipcRenderer.send('fileselect')
        ipcRenderer.on('fileselect:reply', function(event,reply){
            if (reply.canceled){
                console.log("File select canceled, no update of state")
            } else {
                document.getElementById('encrypt_filepath').value = reply.filePaths[0] // multi-select diabled, this will always have a single value

                set_filepath_input(reply.filePaths[0])             }
        });
    }


    const folder_gui_open = () => {
        ipcRenderer.send('folderselect')
        ipcRenderer.on('folderselect:reply', function(event,reply){
            if (reply.canceled){
                console.log("Folder select canceled, no update of state")
            } else {
                document.getElementById('encrypt_filepath').value = reply.filePaths[0] // multi-select diabled, this will always have a single value

                set_filepath_input(reply.filePaths[0])             }
        });
    }



    const password_generator = () => {
        let CONFIG__pass_word_len = 8
        let CONFIG__pass_word_obj = ''
        let i = 0;
        for(i=0;i<CONFIG__pass_word_len;i++){
            let random_choice = Math.floor(Math.random() * pass_words['words'].length)
            CONFIG__pass_word_obj += `${pass_words['words'][random_choice]} `
        }
        let password_gend = CONFIG__pass_word_obj.substring(0,CONFIG__pass_word_obj.length-1)
        set_pass_input(password_gend)
        document.getElementById('encrypt_pass_input').value = password_gend
    }


        

    const encrypt_file = (event) => {
        // verify_type()
        if(type_input === 'invalid'){
            console.log('Invalid file/folder')
            set_error_stat(true)
            set_error_text("Invalid file/folder path")
            // Show error message
        } else if (type_input ==="file"){
            // Straight forward encryption
            ipcRenderer.send('encrypt:file', {"file_path":filepath_input, "pass":pass_input} )
            ipcRenderer.on('encrypt:file:reply', function(event,reply){
                if (reply.success){
                    set_success_text(reply.location)
                    set_success_stat(true)
                } else {
                    set_error_text("Failed encryption - check file encoding")
                    set_error_stat(true)
                }
            })
        }
         else if (type_input === "dir"){
            // Complex deconstruction of sub_folders and files
            ipcRenderer.send('encrypt:dir', {"file_path":filepath_input, "pass":pass_input} )
            ipcRenderer.on('encrypt:dir:reply', function(event,reply){
                if (reply.success){
                    set_success_text(reply.location)
                    set_success_stat(true)
                } else {
                    set_error_text("Failed encryption - check file encoding")
                    set_error_stat(true)
                }
            })
         }
    }







    return (
        <div>
            <HeadFrame/>
            <BackButton />

            <ErrorMessage error_text={error_text} error_display={error_display} />
            <SuccessMessage success_text={success_text} success_display={success_display} set_success_stat={set_success_stat} />

            <img src={encrypt_logo} className="encrypt_page_logo" alt="Encrypt logo on encrypt page"/>
        
            <div className="encrypt_page_form_frame">

                    <div className="encrypt_form_fileselect">
                        <h3 className="encrypt_form_title">Select Files/Folders</h3>
                        <div className="select_file_gui" onClick={() => file_gui_open()}>File GUI</div>
                        <div className="select_file_gui" onClick={() => folder_gui_open()}>Folder GUI</div>
                    </div>
                    
                    <input id="encrypt_filepath" type="text" className={fileclass} onChange={(event) => handlefilepath()} />
                    <h5 className='input_subtext'>File/Folder path... Folders will have the entirety of their contents encrypted</h5>


                    <div className="encrypt_form_fileselect">
                        <h3 className="encrypt_form_title">Enter a custom key/password</h3>
                        <div className="select_file_gui" onClick={() => password_generator()}>Random</div>
                    </div>

                    <input id="encrypt_pass_input" type="text" className="pass_text_input"  onChange={(event) => handlepass()} />
                    <h5 className='input_subtext'>Please write this down, there is no recovery process... Randomized passwords recommended.</h5>


                    <div className='execution_button' onClick={()=> encrypt_file()}>
                        <h5 className='execution_text'>ENCRYPT</h5>
                    </div>

            </div>



        </div>
    )
}

export default Encrypt
