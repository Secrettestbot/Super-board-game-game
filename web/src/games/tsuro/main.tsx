import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './tsuro.css'
import { Tsuro } from './Tsuro'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tsuro />
  </StrictMode>,
)
