import ModelList from "./_components/model-list";

/**
 * E11-S013 "Model admin" — thin route wrapper, same shape
 * users/page.tsx (E11-S002) already establishes: the page itself owns
 * only the frame, ModelList owns the loading/error/empty/loaded states
 * and the per-row status toggle.
 */
export default function ModelsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>模型管理</h1>
      <ModelList />
    </main>
  );
}
