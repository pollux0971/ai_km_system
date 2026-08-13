import UserMenu from "./user-menu";

/** E01-S005: header bar — branding + user-menu. */
export default function Header() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid #e5e5e5",
      }}
    >
      <span style={{ fontWeight: 600 }}>AI KM</span>
      <UserMenu />
    </header>
  );
}
