import '@/components/ui/ui.css';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

import { useModalBodyLock, usePreventNumberInputWheel } from '@/lib/ui/modal-utils';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  showClose?: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getInitialFocusTarget(panel: HTMLElement): HTMLElement | null {
  const body = panel.querySelector('.ui-modal__body');
  const inBody = body?.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (inBody && inBody.length > 0) return inBody[0];

  const inPanel = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
  return inPanel[0] ?? null;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  className = '',
  panelClassName = '',
  showClose = true,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const backdropPointerDownRef = useRef(false);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useModalBodyLock(open);
  usePreventNumberInputWheel(modalRef, open);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    requestAnimationFrame(() => {
      if (!panel) return;
      getInitialFocusTarget(panel)?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const elements = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div ref={modalRef} className={`ui-modal ${className}`.trim()} role="presentation">
      <button
        type="button"
        className="ui-modal__backdrop"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            backdropPointerDownRef.current = true;
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && backdropPointerDownRef.current) {
            onCloseRef.current();
          }
          backdropPointerDownRef.current = false;
        }}
        aria-label="Cerrar"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        className={`ui-modal__panel ${panelClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || showClose) && (
          <header className="ui-modal__header">
            {title && (
              <div className="ui-modal__title-wrap" id={titleId}>
                {typeof title === 'string' ? <h2>{title}</h2> : title}
              </div>
            )}
            {showClose && (
              <button
                type="button"
                className="ui-modal__close"
                onClick={() => onCloseRef.current()}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>
  );
}
