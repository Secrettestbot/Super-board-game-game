import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './canadian_checkers.css'
import { CanadianCheckers } from './CanadianCheckers'
createRoot(document.getElementById('root')!).render(<StrictMode><CanadianCheckers /></StrictMode>)
