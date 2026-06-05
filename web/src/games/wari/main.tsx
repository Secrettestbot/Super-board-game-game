import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './wari.css'
import { Wari } from './Wari'
createRoot(document.getElementById('root')!).render(<StrictMode><Wari /></StrictMode>)
