import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './quixo.css'
import { Quixo } from './Quixo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Quixo />
  </StrictMode>,
)
