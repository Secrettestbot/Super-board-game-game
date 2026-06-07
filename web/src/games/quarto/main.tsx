import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './quarto.css'
import { Quarto } from './Quarto'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Quarto />
  </StrictMode>,
)
