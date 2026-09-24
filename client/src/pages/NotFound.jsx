import { Link, useLocation } from 'react-router-dom';

/**
 * Catch-all for any URL that doesn't match a real route (Sep 2026, Aaron:
 * hit a stale bookmarked /new-job URL and got a silently blank page —
 * React Router renders nothing at all when nothing matches inside
 * <Routes>, with no visual distinction from "still loading" or "actually
 * broken"). This makes that case visible and gives an obvious way back
 * instead of a dead end.
 */
export default function NotFound() {
  const location = useLocation();
  return (
    <div className="max-w-lg mx-auto text-center py-24">
      <p className="text-5xl mb-4">🦋</p>
      <h1 className="text-xl font-semibold text-primary-900 mb-2">Page not found</h1>
      <p className="text-sm text-neutral-500 mb-6">
        There's no page at <code className="px-1 py-0.5 bg-neutral-100 rounded">{location.pathname}</code> — it may be an old bookmark from before this app's routes changed.
      </p>
      <Link to="/" className="btn btn-secondary">← Back to Dashboard</Link>
    </div>
  );
}
