import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './kingdomino.css'
import { Kingdomino } from './Kingdomino'
createRoot(document.getElementById('root')!).render(<StrictMode><Kingdomino /></StrictMode>)
