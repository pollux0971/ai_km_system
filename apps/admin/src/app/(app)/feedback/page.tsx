import FeedbackList from "./_components/feedback-list";

/**
 * E11-S016 "Feedback queue" — thin route wrapper, same shape
 * audit/page.tsx (E11-S015) already establishes: the page itself owns
 * only the frame, FeedbackList owns the loading/error/empty/loaded
 * states.
 */
export default function FeedbackPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>回饋佇列</h1>
      <FeedbackList />
    </main>
  );
}
