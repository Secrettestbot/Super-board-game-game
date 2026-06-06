import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './power_grid.css'
import { PowerGrid } from './PowerGrid'
createRoot(document.getElementById('root')!).render(<StrictMode><PowerGrid /></StrictMode>)
