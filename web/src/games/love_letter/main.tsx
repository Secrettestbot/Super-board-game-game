import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './love_letter.css'
import { LoveLetter } from './LoveLetter'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoveLetter />
  </StrictMode>,
)
