import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './hearts.css'
import { Hearts } from './Hearts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hearts />
  </StrictMode>,
)
