export default function Modal({ open, onClose, title, children, footer, maxWidth }) {
  return (
    <div className={`modal-overlay${open ? ' show' : ''}`}>
      <div className="modal" style={maxWidth ? { maxWidth } : undefined}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><i className="fas fa-xmark"></i></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
