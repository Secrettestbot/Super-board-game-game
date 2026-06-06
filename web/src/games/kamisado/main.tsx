import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './kamisado.css'
import { Kamisado } from './Kamisado'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Kamisado />
  </StrictMode>,
)
