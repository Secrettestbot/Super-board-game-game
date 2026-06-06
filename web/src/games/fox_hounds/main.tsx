import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './fox_hounds.css'
import { FoxHounds } from './FoxHounds'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoxHounds />
  </StrictMode>,
)
