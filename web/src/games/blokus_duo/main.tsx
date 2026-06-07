import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './blokus_duo.css'
import { BlokusDuo } from './BlokusDuo'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BlokusDuo />
  </StrictMode>,
)
