import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './coloretto.css'
import { Coloretto } from './Coloretto'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Coloretto />
  </StrictMode>,
)
