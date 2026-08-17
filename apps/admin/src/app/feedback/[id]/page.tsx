import FeedbackDetail from "./_components/feedback-detail";

/**
 * E11-S017 "Feedback detail" — thin route wrapper, same shape
 * users/[id]/page.tsx (E11-S003) already establishes: the page owns the
 * id extraction + frame, FeedbackDetail owns the loading/error/not-found/
 * loaded states.
 */
export default async function FeedbackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main style={{ padding: 32 }}>
      <FeedbackDetail feedbackId={id} />
    </main>
  );
}
