import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './tiny_towns.css'
import { TinyTowns } from './TinyTowns'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TinyTowns />
  </StrictMode>,
)
