import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { updateRecommendationStatus } from "@/app/app/recommendations/actions";
import { demoRecommendationRows } from "@/lib/queues/demo-queues";
import { getRecommendationQueueRows, type RecommendationQueueRow } from "@/lib/queues/get-queue-data";

export default async function RecommendationsPage() {
  const rows = await getRecommendationQueueRows(demoRecommendationRows);

  return (
    <QueuePageShell
      eyebrow="AI Recommendations"
      title="Recommendation Queue"
      description="SEO, campaign, content, lead-management, and operations recommendations for admin review."
    >
      <QueueTable<RecommendationQueueRow>
        rows={rows}
        columns={[
          {
            key: "title",
            label: "Recommendation",
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <span className="muted">{row.summary}</span>
              </>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "category", label: "Category", render: (row) => row.category },
          { key: "impact", label: "Impact", render: (row) => row.impactEstimate },
          { key: "risk", label: "Risk", render: (row) => <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.status === "open" || row.status === "approved" ? (
                <form action={updateRecommendationStatus} className="inline-actions">
                  <input name="recommendationId" type="hidden" value={row.id} />
                  <button className="mini-button" name="status" type="submit" value="approved">
                    Approve
                  </button>
                  <button className="mini-button" name="status" type="submit" value="completed">
                    Complete
                  </button>
                  <button className="mini-button danger-button" name="status" type="submit" value="rejected">
                    Reject
                  </button>
                </form>
              ) : (
                <span className="muted">Closed</span>
              )
          }
        ]}
      />
    </QueuePageShell>
  );
}
