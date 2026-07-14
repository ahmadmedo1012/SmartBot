export function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = "تأكيد", isLoading }) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth:400}}>
        <div className="cc-header">
          <div className="cc-title">{title}</div>
        </div>
        <div style={{padding:16}}>
          <p style={{fontSize:14,color:"var(--fg)",marginBlockEnd:16}}>{message}</p>
          <div className="qactions" style={{justifyContent:"flex-end"}}>
            <button className="btn btn-outline" onClick={onCancel}>إلغاء</button>
            <button className="btn btn-primary" onClick={onConfirm} disabled={isLoading} style={{background:"var(--danger)"}}>
              {isLoading ? "جاري..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
