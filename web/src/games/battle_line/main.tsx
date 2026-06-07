import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './battle_line.css'
import { BattleLine } from './BattleLine'
createRoot(document.getElementById('root')!).render(<StrictMode><BattleLine /></StrictMode>)
