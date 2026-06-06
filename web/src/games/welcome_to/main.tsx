import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './welcome_to.css'
import { WelcomeTo } from './WelcomeTo'
createRoot(document.getElementById('root')!).render(<StrictMode><WelcomeTo /></StrictMode>)
