import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './hex.css'
import { Hex } from './Hex'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hex />
  </StrictMode>,
)
