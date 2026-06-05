import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './pickomino.css'
import { Pickomino } from './Pickomino'
createRoot(document.getElementById('root')!).render(<StrictMode><Pickomino /></StrictMode>)
