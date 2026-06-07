import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './photosynthesis.css'
import { Photosynthesis } from './Photosynthesis'
createRoot(document.getElementById('root')!).render(<StrictMode><Photosynthesis /></StrictMode>)
