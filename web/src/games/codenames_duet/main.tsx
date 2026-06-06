import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './codenames_duet.css'
import { CodenamesDuet } from './CodenamesDuet'
createRoot(document.getElementById('root')!).render(<StrictMode><CodenamesDuet /></StrictMode>)
