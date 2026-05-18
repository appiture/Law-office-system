import { fullLogout } from "../../services/authService";

function UserMenu({ 
  userAvatar, 
  userName, 
  userEmail, 
  userRole, 
  superAdmin, 
  setUserAvatar 
}) {
  return (
    <div className="profile-panel">
      <div className="profile-info">
        {userAvatar ? (
          <img src={userAvatar} alt={userName} className="user-avatar" onError={() => setUserAvatar(null)} />
        ) : (
          <div className="user-avatar-fallback">{userEmail.charAt(0).toUpperCase()}</div>
        )}
        <div className="profile-copy">
          <p className="profile-label">Signed in as</p>
          <strong>{userName || userEmail}</strong>
          <p className="profile-role" style={superAdmin ? { color: "#C9A34E", fontWeight: 700 } : {}}>
            {superAdmin ? "⭐ Super Admin" : userRole}
          </p>
        </div>
      </div>
      <button type="button" className="ghost-button" onClick={() => void fullLogout()}>
        Logout
      </button>
    </div>
  );
}

export default UserMenu;
