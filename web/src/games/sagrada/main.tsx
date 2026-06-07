import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './sagrada.css'
import { Sagrada } from './Sagrada'
createRoot(document.getElementById('root')!).render(<StrictMode><Sagrada /></StrictMode>)
