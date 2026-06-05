import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './backgammon.css'
import { Backgammon } from './Backgammon'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Backgammon />
  </StrictMode>,
)
