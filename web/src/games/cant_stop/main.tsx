import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cant_stop.css'
import { CantStop } from './CantStop'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CantStop />
  </StrictMode>,
)
