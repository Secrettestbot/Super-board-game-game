import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './stratego.css'
import { Stratego } from './Stratego'
createRoot(document.getElementById('root')!).render(<StrictMode><Stratego /></StrictMode>)
