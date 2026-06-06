import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './chess.css'
import { Chess } from './Chess'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Chess />
  </StrictMode>,
)
