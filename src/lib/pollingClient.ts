/**
 * pollingClient.ts
 * Drop-in replacement for supabaseRealtime.channel() subscriptions.
 *
 * Current Supabase usage → polling equivalent:
 *
 *   App.tsx:
 *     supabaseRealtime.channel('projects-insert-watch')
 *       .on('postgres_changes', { table: 'projects' }, () => fetchProjects())
 *       .subscribe()
 *     → pollTable('projects', fetchProjects, 30_000)
 *
 *   NotificationBell.tsx:
 *     supabaseRealtime.channel('notif_bell_' + uid)
 *       .on('postgres_changes', { table: 'notifications' }, loadNotifs)
 *       .subscribe()
 *     → pollTable('notifications', loadNotifs, 15_000)
 *
 *   ProjectChat.tsx:
 *     supabaseRealtime.channel('chat_' + projectId)
 *       .on('postgres_changes', { table: 'project_messages' }, () => loadMessages())
 *       .subscribe()
 *     → pollTable('chat:' + projectId, loadMessages, 3_000)
 *
 * All intervals pause when the browser tab is hidden to save resources.
 */

export interface PollHandle {
  unsubscribe: () => void;
}

// Registry of active polls so we can pause/resume on visibility change
const activePolls = new Set<{ timer: ReturnType<typeof setInterval>; callback: () => void; intervalMs: number }>();

// Pause all polls when tab is hidden; resume when visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      activePolls.forEach(p => clearInterval(p.timer));
    } else {
      activePolls.forEach(p => {
        p.callback(); // immediate catch-up call on tab re-focus
        p.timer = setInterval(p.callback, p.intervalMs);
      });
    }
  });
}

/**
 * Start polling a callback at a given interval.
 * Fires immediately on first call, then every `intervalMs` ms.
 * Pauses automatically when the tab is hidden.
 *
 * @param _channel  Channel name (for debug identification — not used for routing)
 * @param callback  Function to call on each poll tick
 * @param intervalMs  Polling interval in milliseconds
 * @returns PollHandle with unsubscribe()
 */
export function pollTable(
  _channel: string,
  callback: () => void,
  intervalMs: number
): PollHandle {
  const entry = {
    callback,
    intervalMs,
    timer: setInterval(callback, intervalMs),
  };
  activePolls.add(entry);

  return {
    unsubscribe: () => {
      clearInterval(entry.timer);
      activePolls.delete(entry);
    },
  };
}

/**
 * One-time deferred call (replaces .subscribe() with no polling).
 * Use when you only need a single fetch on mount, not periodic updates.
 */
export function fetchOnce(callback: () => void): PollHandle {
  const id = setTimeout(callback, 0);
  return { unsubscribe: () => clearTimeout(id) };
}
