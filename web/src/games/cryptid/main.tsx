import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cryptid.css'
import { Cryptid } from './Cryptid'
createRoot(document.getElementById('root')!).render(<StrictMode><Cryptid /></StrictMode>)
