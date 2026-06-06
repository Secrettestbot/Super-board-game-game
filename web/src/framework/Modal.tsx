import type { ReactNode } from 'react'

export interface ModalProps {
  /** Small uppercase eyebrow above the title (e.g. "How to play"). */
  eyebrow: string
  title: string
  /** Called when the overlay is clicked (if closeOnOverlay). */
  onClose?: () => void
  /** Whether clicking the dimmed backdrop closes the modal. Default true. */
  closeOnOverlay?: boolean
  /** Body content — supply your own <div className="modal-body"> etc. */
  children?: ReactNode
  /** Footer buttons. */
  actions: ReactNode
}

/**
 * The shared overlay + modal primitive used for both the rules and result dialogs.
 * Styling comes from the .overlay / .modal* classes in tokens.css.
 */
export function Modal({ eyebrow, title, onClose, closeOnOverlay = true, children, actions }: ModalProps) {
  return (
    <div className="overlay" onClick={closeOnOverlay ? onClose : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eye">{eyebrow}</div>
        <h2 className="modal-title">{title}</h2>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}
