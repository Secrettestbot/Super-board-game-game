import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './qwirkle.css'
import { Qwirkle } from './Qwirkle'
createRoot(document.getElementById('root')!).render(<StrictMode><Qwirkle /></StrictMode>)
