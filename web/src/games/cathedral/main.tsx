import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cathedral.css'
import { Cathedral } from './Cathedral'
createRoot(document.getElementById('root')!).render(<StrictMode><Cathedral /></StrictMode>)
