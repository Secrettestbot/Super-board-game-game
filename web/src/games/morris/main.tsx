import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './morris.css'
import { Morris } from './Morris'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Morris />
  </StrictMode>,
)
