import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './ludo.css'
import { Ludo } from './Ludo'
createRoot(document.getElementById('root')!).render(<StrictMode><Ludo /></StrictMode>)
