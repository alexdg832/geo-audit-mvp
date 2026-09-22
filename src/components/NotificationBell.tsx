"use client";

import { useEffect, useState } from "react";
import { getNotificationsSummary, markAllNotificationsRead } from "@/lib/actions/notifications";

type NotificationItem = {
  id: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const summary = await getNotificationsSummary();
      if (cancelled) return;
      setCount(summary.count);
      setNotifications(summary.notifications);
    }

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && count > 0) {
      await markAllNotificationsRead();
      setCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative rounded-full p-2 text-xl hover:bg-stone-100"
        aria-label="Notifications"
      >
        🔔
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold text-stone-900">Notifications</p>
          {notifications.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className="rounded-lg bg-stone-50 p-2 text-sm text-stone-700">
                  {n.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
