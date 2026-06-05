import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './checkers.css'
import { Checkers } from './Checkers'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Checkers />
  </StrictMode>,
)
