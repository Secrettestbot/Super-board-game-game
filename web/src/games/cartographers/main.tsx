import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cartographers.css'
import { Cartographers } from './Cartographers'
createRoot(document.getElementById('root')!).render(<StrictMode><Cartographers /></StrictMode>)
