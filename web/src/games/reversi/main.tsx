import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './reversi.css'
import { Reversi } from './Reversi'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Reversi />
  </StrictMode>,
)
