import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './deep_sea_adventure.css'
import { DeepSeaAdventure } from './DeepSeaAdventure'
createRoot(document.getElementById('root')!).render(<StrictMode><DeepSeaAdventure /></StrictMode>)
