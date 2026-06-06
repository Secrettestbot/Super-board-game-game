import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './mille_bornes.css'
import { MilleBornes } from './MilleBornes'
createRoot(document.getElementById('root')!).render(<StrictMode><MilleBornes /></StrictMode>)
