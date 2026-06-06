import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './fox_in_forest.css'
import { FoxInForest } from './FoxInForest'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FoxInForest />
  </StrictMode>,
)
