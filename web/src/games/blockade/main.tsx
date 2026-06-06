import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './blockade.css'
import { Blockade } from './Blockade'
createRoot(document.getElementById('root')!).render(<StrictMode><Blockade /></StrictMode>)
