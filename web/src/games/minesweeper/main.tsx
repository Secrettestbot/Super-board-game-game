import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './minesweeper.css'
import { Minesweeper } from './Minesweeper'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Minesweeper />
  </StrictMode>,
)
