import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './spades.css'
import { Spades } from './Spades'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Spades />
  </StrictMode>,
)
