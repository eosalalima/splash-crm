export const instant = false;
import Link from "next/link";
import { workspaceRequest } from "@/lib/access/server";
import { getDb } from "@/lib/db";
import { workspaceService } from "@/lib/domain/workspace";
import { can, presets, roles } from "@/lib/access/policy";
import { WorkspaceActionForm } from "@/components/workspace-action-form";
export default async function WorkspaceSettings() {
  const info = await workspaceRequest();
  await workspaceService(getDb()).within(
    info.actor,
    info.organizationId,
    "configure",
    async () => null,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Workspace administration</h1>
          <p>{info.organization.name} · Membership, roles and teams</p>
        </div>
        <Link href="/settings/audit" className="button secondary">
          Audit history
        </Link>
      </div>
      <section className="panel panel-heading">
        <h2>Role presets</h2>
        <p className="muted">
          Visibility and permissions are fixed per role. Department scopes and
          custom roles are unsupported.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Scope</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role}>
                  <td>{role}</td>
                  <td>{presets[role].scope}</td>
                  <td>{presets[role].permissions.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="workspace-admin-grid">
        <section className="panel panel-heading">
          <h2>Invite a member</h2>
          <p className="muted">
            Share the generated link securely. Email delivery is not automatic.
          </p>
          <WorkspaceActionForm operation="invite" label="Create invitation">
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="representative">
                {roles.map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
          </WorkspaceActionForm>
        </section>
        <section className="panel panel-heading">
          <h2>Create team</h2>
          <WorkspaceActionForm operation="team" label="Create team">
            <label>
              Team name
              <input name="name" required maxLength={120} />
            </label>
          </WorkspaceActionForm>
        </section>
      </div>
      <section className="panel panel-heading">
        <h2>Pending invitations (latest 50)</h2>
        {info.pendingInvitations.length ? (
          info.pendingInvitations.map((invitation) => (
            <div className="member-row" key={invitation.id}>
              <p>
                {invitation.email} · {invitation.role} · Expires{" "}
                {invitation.expiresAt.toISOString()}
              </p>
              <WorkspaceActionForm
                operation="revoke-invitation"
                label="Revoke invitation"
              >
                <input
                  type="hidden"
                  name="invitationId"
                  value={invitation.id}
                />
              </WorkspaceActionForm>
            </div>
          ))
        ) : (
          <p className="muted">No pending invitations.</p>
        )}
      </section>
      <section className="panel panel-heading">
        <h2>Active members</h2>
        {info.members.map((member) => (
          <div className="member-row" key={member.userId}>
            <h3>
              {member.name}{" "}
              <span className="muted small">
                {member.email || member.userId}
              </span>
            </h3>
            <WorkspaceActionForm operation="member" label="Update member">
              <input type="hidden" name="userId" value={member.userId} />
              <label>
                Role
                <select name="role" defaultValue={member.role}>
                  {roles.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label>
                Access
                <select name="revoke">
                  <option value="no">Keep active</option>
                  <option value="yes">Revoke membership</option>
                </select>
              </label>
            </WorkspaceActionForm>
          </div>
        ))}
      </section>
      <section className="panel panel-heading">
        <h2>Team memberships</h2>
        {info.teams.length ? (
          <>
            <p className="muted">
              {info.teams
                .map(
                  (t) =>
                    `${t.name}: ${
                      info.teamMembers
                        .filter((tm) => tm.teamId === t.id)
                        .map(
                          (tm) =>
                            info.members.find((m) => m.userId === tm.userId)
                              ?.name || tm.userId,
                        )
                        .join(", ") || "No members"
                    }`,
                )
                .join(" · ")}
            </p>
            <WorkspaceActionForm
              operation="team-member"
              label="Update team membership"
            >
              <label>
                Team
                <select name="teamId">
                  {info.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Member
                <select name="userId">
                  {info.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Action
                <select name="remove">
                  <option value="no">Add to team</option>
                  <option value="yes">Remove from team</option>
                </select>
              </label>
            </WorkspaceActionForm>
          </>
        ) : (
          <p className="muted">Create a team to assign its members.</p>
        )}
      </section>
      {can(info.context.role, "configure") && (
        <Link className="text-link" href="/workspaces">
          Switch or create a workspace
        </Link>
      )}
    </>
  );
}
