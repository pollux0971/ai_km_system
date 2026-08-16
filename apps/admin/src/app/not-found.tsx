import Link from "next/link";

/**
 * Generic route-tree 404 established as part of the E11-S001 bootstrap —
 * mirrors apps/web's own not-found.tsx (E01-S001). Authorization-aware
 * 401/403 guards for specific protected admin routes are a separate
 * concern owned by E11-S023 "admin route authorization" — this page only
 * handles "no route matched".
 */
export default function NotFound() {
  return (
    <main style={{ padding: 32 }}>
      <h1>頁面不存在</h1>
      <p>找不到您要瀏覽的頁面。</p>
      <Link href="/">回首頁</Link>
    </main>
  );
}
