import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './quacks.css'
import { Quacks } from './Quacks'
createRoot(document.getElementById('root')!).render(<StrictMode><Quacks /></StrictMode>)
