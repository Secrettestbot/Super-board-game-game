import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './mahjong_solitaire.css'
import { MahjongSolitaire } from './MahjongSolitaire'
createRoot(document.getElementById('root')!).render(<StrictMode><MahjongSolitaire /></StrictMode>)
