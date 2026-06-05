import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './pig.css'
import { Pig } from './Pig'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pig />
  </StrictMode>,
)
