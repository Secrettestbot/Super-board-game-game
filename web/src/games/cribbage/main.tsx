import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cribbage.css'
import { Cribbage } from './Cribbage'
createRoot(document.getElementById('root')!).render(<StrictMode><Cribbage /></StrictMode>)
