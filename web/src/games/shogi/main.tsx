import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './shogi.css'
import { Shogi } from './Shogi'
createRoot(document.getElementById('root')!).render(<StrictMode><Shogi /></StrictMode>)
