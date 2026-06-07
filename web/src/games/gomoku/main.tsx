import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './gomoku.css'
import { Gomoku } from './Gomoku'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gomoku />
  </StrictMode>,
)
