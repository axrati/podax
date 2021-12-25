import React from 'react'
import './HeadFrame.css'
const { ipcRenderer } = window.require("electron");

function Head_frame() {

    let minimizeApp = function(){
        ipcRenderer.send('app:minimize')
      }

    let quitApp = function(){
    ipcRenderer.send('app:exit')
    }

    return (
        <div className="header_box">
            <div className="header_frame"></div>
            <div className="header_minimize" onClick={() => minimizeApp()}> - </div>
            <div className="header_exit" onClick={() => quitApp()}> x </div>
            
        </div>
    )
}

export default Head_frame
