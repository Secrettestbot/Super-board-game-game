import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './santorini.css'
import { Santorini } from './Santorini'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Santorini />
  </StrictMode>,
)
