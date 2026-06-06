import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './word_game.css'
import { WordGame } from './WordGame'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WordGame />
  </StrictMode>,
)
