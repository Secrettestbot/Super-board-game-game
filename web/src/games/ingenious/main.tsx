import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './ingenious.css'
import { Ingenious } from './Ingenious'
createRoot(document.getElementById('root')!).render(<StrictMode><Ingenious /></StrictMode>)
