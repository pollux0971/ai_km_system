/**
 * ux/admin-ui-overhaul: slim header bar — the apps/web Header (E01-S005)
 * counterpart. Brand carries an explicit Admin badge so the console is
 * visually distinct from the end-user app at a glance (user-directed).
 * No notification center / user menu: apps/admin has no session source
 * yet (see AdminRouteGuard's doc comment, E11-S023), so there is nothing
 * truthful to render on the right — an empty actions area is honest,
 * a mocked "logged in as admin" chip would not be.
 */
export default function AdminHeader() {
  return (
    <header className="app-header">
      <span className="app-header-brand">
        <span>AI KM</span>
        <span className="admin-badge">Admin</span>
      </span>
      <span className="app-header-note">企業知識管理平台 — 後台管理</span>
    </header>
  );
}
