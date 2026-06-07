import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './boggle.css'
import { Boggle } from './Boggle'
createRoot(document.getElementById('root')!).render(<StrictMode><Boggle /></StrictMode>)
