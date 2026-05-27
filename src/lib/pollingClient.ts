/**
 * pollingClient.ts
 * AWS-native polling replacement for real-time database subscriptions.
 *
 * Replaces Supabase Realtime WebSocket channels with HTTP polling.
 * Usage map (legacy → polling equivalent):
 *
 *   App.tsx:
 *     [realtime channel: 'projects-insert-watch']
 *     → pollTable('projects', fetchProjects, 30_000)
 *
 *   NotificationBell.tsx:
 *     [realtime channel: 'notif_bell_' + uid]
 *     → pollTable('notifications', loadNotifs, 15_000)
 *
 *   ProjectChat.tsx:
 *     [realtime channel: 'chat_' + projectId]
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
