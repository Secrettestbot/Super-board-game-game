import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './havannah.css'
import { Havannah } from './Havannah'
createRoot(document.getElementById('root')!).render(<StrictMode><Havannah /></StrictMode>)
