import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './star_realms.css'
import { StarRealms } from './StarRealms'
createRoot(document.getElementById('root')!).render(<StrictMode><StarRealms /></StrictMode>)
