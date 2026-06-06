import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './liars_dice.css'
import { LiarsDice } from './LiarsDice'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiarsDice />
  </StrictMode>,
)
