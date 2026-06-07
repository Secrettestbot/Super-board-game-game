import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './splendor.css'
import { Splendor } from './Splendor'
createRoot(document.getElementById('root')!).render(<StrictMode><Splendor /></StrictMode>)
