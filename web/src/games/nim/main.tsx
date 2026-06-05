import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './nim.css'
import { Nim } from './Nim'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Nim />
  </StrictMode>,
)
