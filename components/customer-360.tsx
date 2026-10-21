import Link from "next/link";
import { WorkflowForm } from "./workflow-form";
import { money } from "@/lib/format";
import type { workflowService } from "@/lib/domain/workflow";
import type { Kind } from "@/lib/validation";
type Service = ReturnType<typeof workflowService>;
export function Customer360({
  kind,
  id,
  data,
  config,
  editable,
  convertible,
  contacts,
  companies,
}: {
  kind: Kind;
  id: string;
  data: Awaited<ReturnType<Service["customer360"]>>;
  config: Awaited<ReturnType<Service["configuration"]>>;
  editable: boolean;
  convertible: boolean;
  contacts: { id: string; name: string }[];
  companies: { id: string; name: string }[];
}) {
  return (
    <>
      {convertible && (
        <section className="panel panel-heading">
          <h2>Convert lead</h2>
          <p>
            Use an existing contact/account or create new records. Conversion is
            permanent; repeating it returns the same result. New records are
            assigned to you. Existing records are preserved.
          </p>
          <WorkflowForm command="convert" id={id} button="Convert lead">
            <div className="form-grid">
              <label>
                Match existing contact
                <select name="contactId">
                  <option value="">Create new contact</option>
                  {contacts.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Match existing account
                <select name="companyId">
                  <option value="">
                    Use matched contact’s account or create below
                  </option>
                  {companies.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input type="checkbox" name="createCompany" defaultChecked />
                Create account from lead company if no match
              </label>
              <label>
                <input
                  type="checkbox"
                  name="createOpportunity"
                  defaultChecked
                />
                Create opportunity
              </label>
              <label>
                Opportunity name
                <input name="opportunityName" maxLength={160} />
              </label>
            </div>
          </WorkflowForm>
        </section>
      )}
      <section className="panel panel-heading">
        <h2>Customer 360</h2>
        {data.converted.length > 0 && (
          <p>
            Converted records:{" "}
            {data.converted.map((r) => (
              <Link
                key={r.id}
                className="button secondary"
                href={`/${r.kind}/${r.id}`}
              >
                {r.name}
              </Link>
            ))}
          </p>
        )}
        <h3>Related contacts and opportunities</h3>
        <p className="muted">
          Up to 50 per section on this page, within your current visibility. Use
          the Customer 360 pagination below for more.
        </p>
        <div className="inline-actions">
          {data.relatedContacts.map((r) => (
            <Link key={r.id} href={`/contacts/${r.id}`}>
              {r.name}
            </Link>
          ))}
          {data.relatedDeals.map((r) => (
            <Link key={r.id} href={`/deals/${r.id}`}>
              {r.name}
            </Link>
          ))}
        </div>
        <h3>Activities and manual communications</h3>
        {editable && (
          <Link
            className="button secondary"
            href={`/activities/new?${new URLSearchParams({ relatedKind: kind, relatedId: id })}`}
          >
            Log activity
          </Link>
        )}
        {data.activities.length ? (
          data.activities.map((a) => (
            <p key={a.id}>
              <Link href={`/activities/${a.id}`}>{a.name}</Link> · {a.type} ·{" "}
              {a.status} · {a.priority}
              {a.dueAt ? ` · due ${new Date(a.dueAt).toISOString()}` : ""}
              {a.outcome ? ` · ${a.outcome}` : ""}
            </p>
          ))
        ) : (
          <p className="muted">No visible activities on this page.</p>
        )}
        <h3>Record timeline</h3>
        {data.events.map((e) => (
          <p key={e.id}>
            <time>{new Date(e.createdAt).toISOString()}</time> ·{" "}
            {e.action.replaceAll(".", " ")}
          </p>
        ))}
        <div className="inline-actions">
          {data.page > 1 && (
            <Link href={`?timelinePage=${data.page - 1}`}>
              Previous Customer 360 page
            </Link>
          )}
          {data.page * 50 < data.total && (
            <Link href={`?timelinePage=${data.page + 1}`}>
              Next Customer 360 page
            </Link>
          )}
        </div>
      </section>
      {kind === "deals" && (
        <section className="panel panel-heading">
          <h2>Opportunity products</h2>
          <p>
            Prices are snapshotted when added. Opportunity value is entered
            separately; product totals do not overwrite it. Prices use USD.
          </p>
          {data.lines.map((line) => (
            <div key={line.productId}>
              <p>
                {line.name} · {line.quantity} × {money(line.unitPrice)} ={" "}
                {money(line.quantity * line.unitPrice)}
              </p>
              {editable && (
                <WorkflowForm
                  command="product"
                  id={id}
                  button="Update quantity"
                >
                  <input
                    type="hidden"
                    name="productId"
                    value={line.productId}
                  />
                  <label>
                    Quantity (0 removes)
                    <input
                      name="quantity"
                      type="number"
                      min={0}
                      max={10000}
                      defaultValue={line.quantity}
                    />
                  </label>
                </WorkflowForm>
              )}
            </div>
          ))}
          {editable && (
            <WorkflowForm command="product" id={id} button="Add product">
              <label>
                Product
                <select name="productId" required>
                  <option value="">Choose product</option>
                  {config.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.price)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={10000}
                  defaultValue={1}
                />
              </label>
            </WorkflowForm>
          )}
        </section>
      )}
    </>
  );
}
