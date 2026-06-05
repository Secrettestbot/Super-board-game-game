import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './sudoku.css'
import { Sudoku } from './Sudoku'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sudoku />
  </StrictMode>,
)
