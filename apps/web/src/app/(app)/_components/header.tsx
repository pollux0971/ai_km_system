import NotificationCenter from "./notification-center";
import UserMenu from "./user-menu";

/**
 * E01-S005: header bar — branding + user-menu. E01-S014 adds the
 * notification center. E01-S023 adds the M3 top-app-bar treatment
 * (`app-header--m3` — see globals.css's `/* ---- M3 shell ---- *\/`
 * section); no DOM/text/role change.
 */
export default function Header() {
  return (
    <header className="app-header app-header--m3">
      <span className="app-header-brand">AI KM</span>
      <div className="app-header-actions">
        <NotificationCenter />
        <UserMenu />
      </div>
    </header>
  );
}
