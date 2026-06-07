import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './parade.css'
import { Parade } from './Parade'
createRoot(document.getElementById('root')!).render(<StrictMode><Parade /></StrictMode>)
