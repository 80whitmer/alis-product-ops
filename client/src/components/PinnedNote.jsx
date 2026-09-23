/**
 * Renders a HubSpot pinned note from server-built segments (plain strings
 * and {label, href} links — see server/services/pinnedNotes.js), so links
 * stay clickable without injecting HubSpot HTML. Falls back to plain text.
 */
export default function PinnedNoteBody({ segments, text, className = '' }) {
  if (!segments?.length && !text) return null;
  return (
    <div className={`border border-neutral-200 rounded-lg bg-white p-3 ${className}`}>
      <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Pinned note</p>
      <p className="text-xs text-neutral-700 whitespace-pre-wrap break-words">
        {segments?.length
          ? segments.map((s, i) => (typeof s === 'string'
            ? <span key={i}>{s}</span>
            : <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-accent-600 hover:underline">{s.label}</a>))
          : text}
      </p>
    </div>
  );
}
