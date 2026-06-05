import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './tictactoe.css'
import { TicTacToe } from './TicTacToe'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TicTacToe />
  </StrictMode>,
)
