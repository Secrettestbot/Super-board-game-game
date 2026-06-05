import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../framework/tokens.css'
import './cockroach_poker.css'
import { CockroachPoker } from './CockroachPoker'
createRoot(document.getElementById('root')!).render(<StrictMode><CockroachPoker /></StrictMode>)
