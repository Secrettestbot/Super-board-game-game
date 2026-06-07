import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './watergate.css'
import { Watergate } from './Watergate'
createRoot(document.getElementById('root')!).render(<StrictMode><Watergate /></StrictMode>)
