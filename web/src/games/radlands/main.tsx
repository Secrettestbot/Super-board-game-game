import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './radlands.css'
import { Radlands } from './Radlands'
createRoot(document.getElementById('root')!).render(<StrictMode><Radlands /></StrictMode>)
