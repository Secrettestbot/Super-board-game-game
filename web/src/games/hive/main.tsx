import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './hive.css'
import { Hive } from './Hive'
createRoot(document.getElementById('root')!).render(<StrictMode><Hive /></StrictMode>)
