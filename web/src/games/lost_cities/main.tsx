import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './lost_cities.css'
import { LostCities } from './LostCities'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LostCities />
  </StrictMode>,
)
