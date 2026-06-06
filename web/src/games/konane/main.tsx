import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './konane.css'
import { Konane } from './Konane'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Konane />
  </StrictMode>,
)
