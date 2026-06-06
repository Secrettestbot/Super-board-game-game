import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './tablut.css'
import { Tablut } from './Tablut'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tablut />
  </StrictMode>,
)
