import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './port_royal.css'
import { PortRoyal } from './PortRoyal'
createRoot(document.getElementById('root')!).render(<StrictMode><PortRoyal /></StrictMode>)
