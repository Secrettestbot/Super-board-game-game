import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './quoridor.css'
import { Quoridor } from './Quoridor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Quoridor />
  </StrictMode>,
)
