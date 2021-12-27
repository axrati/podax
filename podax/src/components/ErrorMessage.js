import React, {useEffect, useState} from 'react'
import './ErrorMessage.css'

function ErrorMessage(props) {

    return (
        <div>
            <h1 className={props.error_display}>{props.error_text}</h1>
        </div>
    )
}

export default ErrorMessage
