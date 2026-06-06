import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './go.css'
import { Go } from './Go'
createRoot(document.getElementById('root')!).render(<StrictMode><Go /></StrictMode>)
