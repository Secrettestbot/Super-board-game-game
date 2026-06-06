import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './wingspan_card.css'
import { WingspanCard } from './WingspanCard'
createRoot(document.getElementById('root')!).render(<StrictMode><WingspanCard /></StrictMode>)
