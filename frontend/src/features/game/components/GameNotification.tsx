import { useState, useEffect } from 'react';
import { Target, XCircle, Trophy, Info, Flame } from 'lucide-react';
import './GameNotification.css';

export interface GameNotificationData {
  id: string;
  type: 'reward' | 'penalty' | 'milestone' | 'info' | 'streak';
  message: string;
  duration?: number; // ms, default 3000
}

interface GameNotificationProps {
  notifications: GameNotificationData[];
  onDismiss: (id: string) => void;
}

export function GameNotifications({ notifications, onDismiss }: GameNotificationProps) {
  return (
    <div className="game-notifications">
      {notifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  reward: <Target size={16} />,
  penalty: <XCircle size={16} />,
  milestone: <Trophy size={16} />,
  info: <Info size={16} />,
  streak: <Flame size={16} />,
};

function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: GameNotificationData;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = notification.duration || 3000;
    const exitTimer = setTimeout(() => setIsExiting(true), duration - 300);
    const removeTimer = setTimeout(() => onDismiss(notification.id), duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [notification, onDismiss]);

  return (
    <div
      className={`notification-toast notification-toast--${notification.type} ${isExiting ? 'notification-toast--exit' : ''}`}
      onClick={() => onDismiss(notification.id)}
    >
      <span className="notification-toast__icon">
        {TYPE_ICONS[notification.type] || <Info size={16} />}
      </span>
      <span className="notification-toast__message">{notification.message}</span>
    </div>
  );
}
