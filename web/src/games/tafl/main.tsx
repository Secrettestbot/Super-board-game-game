import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './tafl.css'
import { Tafl } from './Tafl'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Tafl />
  </StrictMode>,
)
