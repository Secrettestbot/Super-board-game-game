import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './hanabi.css'
import { Hanabi } from './Hanabi'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hanabi />
  </StrictMode>,
)
