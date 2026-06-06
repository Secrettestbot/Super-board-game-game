import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './jaipur.css'
import { Jaipur } from './Jaipur'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Jaipur />
  </StrictMode>,
)
