import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './carcassonne.css'
import { Carcassonne } from './Carcassonne'
createRoot(document.getElementById('root')!).render(<StrictMode><Carcassonne /></StrictMode>)
