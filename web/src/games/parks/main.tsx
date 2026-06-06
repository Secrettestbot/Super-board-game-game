import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './parks.css'
import { Parks } from './Parks'
createRoot(document.getElementById('root')!).render(<StrictMode><Parks /></StrictMode>)
