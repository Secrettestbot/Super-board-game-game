import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './skull.css'
import { Skull } from './Skull'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Skull />
  </StrictMode>,
)
