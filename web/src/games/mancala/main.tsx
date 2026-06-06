import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './mancala.css'
import { Mancala } from './Mancala'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Mancala />
  </StrictMode>,
)
