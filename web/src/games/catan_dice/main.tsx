import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './catan_dice.css'
import { CatanDice } from './CatanDice'
createRoot(document.getElementById('root')!).render(<StrictMode><CatanDice /></StrictMode>)
