import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './zombie_dice.css'
import { ZombieDice } from './ZombieDice'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ZombieDice />
  </StrictMode>,
)
