import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './euchre.css'
import { Euchre } from './Euchre'
createRoot(document.getElementById('root')!).render(<StrictMode><Euchre /></StrictMode>)
