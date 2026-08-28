import PromptManagement from "./_components/prompt-management";

/**
 * E11-S012 "Prompt admin" — thin route wrapper, same shape
 * departments/page.tsx (E11-S009) already establishes: the page itself
 * owns only the frame, PromptManagement owns the loading/error/loaded
 * states and the create form.
 */
export default function PromptsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>提示詞管理</h1>
      <PromptManagement />
    </main>
  );
}
