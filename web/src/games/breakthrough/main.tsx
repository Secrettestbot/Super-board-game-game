import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './breakthrough.css'
import { Breakthrough } from './Breakthrough'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Breakthrough />
  </StrictMode>,
)
