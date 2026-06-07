import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './dominoes.css'
import { Dominoes } from './Dominoes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dominoes />
  </StrictMode>,
)
