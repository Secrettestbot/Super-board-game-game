import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './clank.css'
import { Clank } from './Clank'
createRoot(document.getElementById('root')!).render(<StrictMode><Clank /></StrictMode>)
