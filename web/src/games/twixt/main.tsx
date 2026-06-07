import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './twixt.css'
import { Twixt } from './Twixt'
createRoot(document.getElementById('root')!).render(<StrictMode><Twixt /></StrictMode>)
