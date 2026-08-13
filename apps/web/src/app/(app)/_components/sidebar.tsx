import Link from "next/link";

/**
 * E01-S005: sidebar structure/layout only. Deliberately ships with a
 * single static "首頁" item — the permission-aware item set (which links
 * show for which role) is E01-S006's job, not this story's. Not a client
 * component: no interactivity of its own yet.
 */
export default function Sidebar() {
  return (
    <nav aria-label="主導覽" style={{ width: 220, flexShrink: 0, borderRight: "1px solid #e5e5e5", padding: 16 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        <li>
          <Link href="/">首頁</Link>
        </li>
      </ul>
    </nav>
  );
}
