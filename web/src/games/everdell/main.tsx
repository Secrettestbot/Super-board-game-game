import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './everdell.css'
import { Everdell } from './Everdell'
createRoot(document.getElementById('root')!).render(<StrictMode><Everdell /></StrictMode>)
