import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './skull_king.css'
import { SkullKing } from './SkullKing'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkullKing />
  </StrictMode>,
)
