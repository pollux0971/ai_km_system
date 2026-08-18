import NotificationCenter from "./notification-center";
import UserMenu from "./user-menu";

/** E01-S005: header bar — branding + user-menu. E01-S014 adds the notification center. */
export default function Header() {
  return (
    <header className="app-header">
      <span className="app-header-brand">AI KM</span>
      <div className="app-header-actions">
        <NotificationCenter />
        <UserMenu />
      </div>
    </header>
  );
}
