import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './tak.css'
import { Tak } from './Tak'
createRoot(document.getElementById('root')!).render(<StrictMode><Tak /></StrictMode>)
