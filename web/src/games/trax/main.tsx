import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './trax.css'
import { Trax } from './Trax'
createRoot(document.getElementById('root')!).render(<StrictMode><Trax /></StrictMode>)
