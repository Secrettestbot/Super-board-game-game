import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './raptor.css'
import { Raptor } from './Raptor'
createRoot(document.getElementById('root')!).render(<StrictMode><Raptor /></StrictMode>)
