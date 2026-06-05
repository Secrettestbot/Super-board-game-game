import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './point_salad.css'
import { PointSalad } from './PointSalad'
createRoot(document.getElementById('root')!).render(<StrictMode><PointSalad /></StrictMode>)
