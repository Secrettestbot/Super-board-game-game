import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './pentago.css'
import { Pentago } from './Pentago'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pentago />
  </StrictMode>,
)
