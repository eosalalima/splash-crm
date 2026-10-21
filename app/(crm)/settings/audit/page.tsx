export const instant = false;
import Link from "next/link";
import { workspaceRequest } from "@/lib/access/server";
import { workspaceService } from "@/lib/domain/workspace";
import { getDb } from "@/lib/db";
import { pageNumber } from "@/lib/domain/crm";
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { actor, organizationId } = await workspaceRequest();
  const result = await workspaceService(getDb()).audit(
    actor,
    organizationId,
    pageNumber((await searchParams).page),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Audit history</h1>
          <p>
            Append-only workspace events. Migration baselines are marked
            explicitly.
          </p>
        </div>
        <Link className="button secondary" href="/settings/workspace">
          Workspace administration
        </Link>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt.toISOString()}</td>
                  <td>{row.actorId || "Migration baseline"}</td>
                  <td>{row.action}</td>
                  <td>
                    {row.entity} · {row.entityId}
                  </td>
                  <td>
                    <details>
                      <summary>Inspect</summary>
                      <pre>
                        {JSON.stringify(
                          { before: row.beforeData, after: row.afterData },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {result.total} events · Page {result.page}
          </span>
          {result.page > 1 && (
            <Link href={`?page=${result.page - 1}`}>Previous</Link>
          )}
          {result.page * 50 < result.total && (
            <Link href={`?page=${result.page + 1}`}>Next</Link>
          )}
        </div>
      </section>
    </>
  );
}
