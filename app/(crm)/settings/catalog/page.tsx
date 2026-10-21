export const instant = false;
import Link from "next/link";
import { notFound } from "next/navigation";
import { workspaceRequest } from "@/lib/access/server";
import { can } from "@/lib/access/policy";
import { getDb } from "@/lib/db";
import { workflowService } from "@/lib/domain/workflow";
import { WorkflowForm } from "@/components/workflow-form";
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const info = await workspaceRequest();
  if (!can(info.context.role, "configure")) notFound();
  const search = await searchParams;
  const config = await workflowService(getDb()).configuration(
    info.actor,
    info.organizationId,
    search.page,
    search.q,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Products and lead sources</h1>
          <p>
            Administrator configuration. Archive entries to retain historical
            links. Prices use USD.
          </p>
        </div>
      </div>
      <form className="search-box">
        <input name="q" aria-label="Search catalog" defaultValue={search.q} />
        <button className="button secondary">Search</button>
      </form>
      {(["products", "sources"] as const).map((kind) => (
        <section className="panel panel-heading" key={kind}>
          <h2>{kind === "products" ? "Products" : "Lead sources"}</h2>
          <WorkflowForm
            command={kind}
            button={kind === "products" ? "Create product" : "Create source"}
          >
            <label>
              Name
              <input name="name" required maxLength={160} />
            </label>
            {kind === "products" && (
              <>
                <label>
                  SKU
                  <input name="sku" maxLength={80} />
                </label>
                <label>
                  Unit price (USD)
                  <input
                    name="price"
                    type="number"
                    min={0}
                    max={9999999.99}
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
              </>
            )}
          </WorkflowForm>
          {config[kind].map((item) => (
            <details key={item.id}>
              <summary>{item.name}</summary>
              <WorkflowForm
                command={kind}
                id={item.id}
                button="Save configuration"
              >
                <label>
                  Name
                  <input
                    name="name"
                    required
                    defaultValue={item.name}
                    maxLength={160}
                  />
                </label>
                {"sku" in item && (
                  <>
                    <label>
                      SKU
                      <input
                        name="sku"
                        defaultValue={item.sku}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Unit price (USD)
                      <input
                        name="price"
                        type="number"
                        min={0}
                        max={9999999.99}
                        step="0.01"
                        defaultValue={item.price / 100}
                      />
                    </label>
                  </>
                )}
                <label>
                  <input type="checkbox" name="archive" />
                  Archive entry
                </label>
              </WorkflowForm>
            </details>
          ))}
        </section>
      ))}
      <nav className="inline-actions" aria-label="Catalog pagination">
        {config.page > 1 && (
          <Link
            href={`?${new URLSearchParams({ q: search.q ?? "", page: String(config.page - 1) })}`}
          >
            Previous
          </Link>
        )}
        {config.page * 50 < config.total && (
          <Link
            href={`?${new URLSearchParams({ q: search.q ?? "", page: String(config.page + 1) })}`}
          >
            Next
          </Link>
        )}
      </nav>
    </>
  );
}
