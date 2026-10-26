export const instant = false;
import Link from "next/link";
import { workspaceRequest } from "@/lib/access/server";
import { getDb } from "@/lib/db";
import { automationService } from "@/lib/domain/automation";
import { AutomationForm } from "@/components/automation/forms";
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { actor, organizationId } = await workspaceRequest();
  const search = await searchParams;
  const data = await automationService(getDb()).inbox(
    actor,
    organizationId,
    search.page,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>Automated updates for opportunities you can currently access.</p>
        </div>
        <Link className="button secondary" href="/notifications">
          Refresh notifications
        </Link>
      </div>
      <section className="panel panel-heading">
        {data.rows.length ? (
          data.rows.map(({ notification: n, opportunityName }) => (
            <article key={n.id} className="funnel-list-item">
              <h2>{n.message}</h2>
              <p>
                <Link href={`/deals/${n.dealId}`}>{opportunityName}</Link>
              </p>
              <p>
                {new Intl.DateTimeFormat("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Manila",
                }).format(n.createdAt)}{" "}
                (Asia/Manila) · {n.readAt ? "Read" : "Unread"}
              </p>
              {!n.readAt && (
                <AutomationForm command="read" id={n.id} label="Mark as read" />
              )}
            </article>
          ))
        ) : (
          <p className="empty-state">No notifications available.</p>
        )}
      </section>
      <nav className="inline-actions" aria-label="Notifications pagination">
        {data.page > 1 && <Link href={`?page=${data.page - 1}`}>Previous</Link>}
        {data.page * 25 < data.total && (
          <Link href={`?page=${data.page + 1}`}>Next</Link>
        )}
      </nav>
    </>
  );
}
