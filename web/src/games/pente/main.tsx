import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './pente.css'
import { Pente } from './Pente'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pente />
  </StrictMode>,
)
