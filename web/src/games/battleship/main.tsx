import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './battleship.css'
import { Battleship } from './Battleship'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Battleship />
  </StrictMode>,
)
