import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './the_mind.css'
import { TheMind } from './TheMind'
createRoot(document.getElementById('root')!).render(<StrictMode><TheMind /></StrictMode>)
