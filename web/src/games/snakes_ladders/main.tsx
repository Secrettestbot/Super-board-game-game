import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './snakes_ladders.css'
import { SnakesLadders } from './SnakesLadders'
createRoot(document.getElementById('root')!).render(<StrictMode><SnakesLadders /></StrictMode>)
