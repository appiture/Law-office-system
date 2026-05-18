import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../../constants/routes";

function NotificationBell({ count }) {
  const navigate = useNavigate();

  return (
    <button 
      className="notification-trigger" 
      onClick={() => navigate(ROUTES.TASKS)}
      style={{ position: 'relative' }}
    >
      <Bell size={20} className="notif-bell" />
      {count > 0 && (
        <span className="nav-badge" style={{ position: 'absolute', top: -5, right: -5 }}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

export default NotificationBell;
