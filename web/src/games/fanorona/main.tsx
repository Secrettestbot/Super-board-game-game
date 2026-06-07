import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './fanorona.css'
import { Fanorona } from './Fanorona'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fanorona />
  </StrictMode>,
)
