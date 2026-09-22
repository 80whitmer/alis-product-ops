export default function Placeholder({ title, blurb, status, note }) {
  return (
    <>
      <div className="page-head">
        <h2>{title}</h2>
        <p>{blurb}</p>
      </div>
      {note && <div className={`notice ${status === 'blocked' ? 'danger' : ''}`}>{note}</div>}
      <div className="card placeholder">
        <span className={`badge ${status}`} style={{ marginBottom: 10, display: 'inline-block' }}>{status}</span>
        <p>Not built yet. See docs/CONTEXT.md for the plan.</p>
      </div>
    </>
  );
}
