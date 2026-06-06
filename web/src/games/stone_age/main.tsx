import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './stone_age.css'
import { StoneAge } from './StoneAge'
createRoot(document.getElementById('root')!).render(<StrictMode><StoneAge /></StrictMode>)
