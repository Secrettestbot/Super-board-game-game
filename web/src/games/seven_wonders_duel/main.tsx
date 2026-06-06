import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './seven_wonders_duel.css'
import { SevenWondersDuel } from './SevenWondersDuel'
createRoot(document.getElementById('root')!).render(<StrictMode><SevenWondersDuel /></StrictMode>)
