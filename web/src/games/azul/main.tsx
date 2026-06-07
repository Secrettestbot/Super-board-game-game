import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './azul.css'
import { Azul } from './Azul'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Azul />
  </StrictMode>,
)
