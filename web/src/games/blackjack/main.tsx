import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './blackjack.css'
import { Blackjack } from './Blackjack'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Blackjack />
  </StrictMode>,
)
