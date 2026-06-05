import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './mastermind.css'
import { Mastermind } from './Mastermind'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Mastermind />
  </StrictMode>,
)
