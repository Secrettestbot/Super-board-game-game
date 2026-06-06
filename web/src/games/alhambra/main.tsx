import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './alhambra.css'
import { Alhambra } from './Alhambra'
createRoot(document.getElementById('root')!).render(<StrictMode><Alhambra /></StrictMode>)
