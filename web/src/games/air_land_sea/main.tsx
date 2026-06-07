import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './air_land_sea.css'
import { AirLandSea } from './AirLandSea'
createRoot(document.getElementById('root')!).render(<StrictMode><AirLandSea /></StrictMode>)
