import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './king_of_tokyo.css'
import { KingOfTokyo } from './KingOfTokyo'
createRoot(document.getElementById('root')!).render(<StrictMode><KingOfTokyo /></StrictMode>)
