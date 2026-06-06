import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './bang_dice.css'
import { BangDice } from './BangDice'
createRoot(document.getElementById('root')!).render(<StrictMode><BangDice /></StrictMode>)
