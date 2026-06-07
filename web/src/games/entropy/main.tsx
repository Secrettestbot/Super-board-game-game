import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './entropy.css'
import { Entropy } from './Entropy'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Entropy />
  </StrictMode>,
)
