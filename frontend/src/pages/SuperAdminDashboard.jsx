import { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import AppShell from "../components/AppShell";
import {
  isPlatformAdmin, checkAdminStatus,
  adminListOrganizations, adminReviewOrganization,
  adminListAllUsers, adminUpdateUser,
  adminListPlatformAdmins, adminAddPlatformAdmin, adminRemovePlatformAdmin,
  adminGetActivityLog,
  adminCreateOrganization,
  adminDeleteOrganization,
  adminDeleteUser,
} from "../services/adminService";
import "./formStyles.css";

/* ── tiny helpers ── */
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtTime = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

function Toast({ msg, type }) {
  return (
    <div style={{
      position: "fixed", top: 24, right: 24, zIndex: 9999,
      background: type === "error" ? "#F87171" : "#34D399",
      color: "#0f172a", padding: "12px 20px", borderRadius: 12,
      fontWeight: 700, fontSize: 14, boxShadow: "0 8px 32px rgba(0,0,0,.3)",
      animation: "fadeUp .2s ease",
    }}>{msg}</div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      borderRadius: 16, backdropFilter: "blur(12px)",
      boxShadow: "0 4px 24px rgba(0,0,0,.07)", ...style,
    }}>{children}</div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <Card style={{ padding: "18px 22px" }}>
      <p style={{ margin: 0, fontSize: 11, opacity: .5, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: color || "var(--color-text)", lineHeight: 1.2 }}>{value}</p>
    </Card>
  );
}

function Badge({ label, color, bg, border }) {
  return (
    <span style={{
      background: bg, color, border: `1px solid ${border || color + "44"}`,
      borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
    }}>{label}</span>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE:           { bg: "rgba(52,211,153,.15)",  color: "#34D399", label: "Active" },
    PENDING_APPROVAL: { bg: "rgba(251,191,36,.15)",  color: "#FBBF24", label: "Pending" },
    REJECTED:         { bg: "rgba(248,113,113,.15)", color: "#F87171", label: "Rejected" },
    INACTIVE:         { bg: "rgba(148,163,184,.12)", color: "#94A3B8", label: "Inactive" },
  };
  const s = map[status] || { bg: "rgba(148,163,184,.1)", color: "#94A3B8", label: status };
  return <Badge label={s.label} color={s.color} bg={s.bg} />;
}

function RoleBadge({ role }) {
  const map = {
    ADMIN:  { bg: "rgba(201,163,78,.15)",  color: "#C9A34E" },
    LAWYER: { bg: "rgba(99,102,241,.15)",  color: "#818CF8" },
    STAFF:  { bg: "rgba(100,116,139,.15)", color: "#94A3B8" },
    USER:   { bg: "rgba(20,184,166,.15)",  color: "#2DD4BF" },
  };
  const s = map[role] || { bg: "rgba(148,163,184,.1)", color: "#94A3B8" };
  return <Badge label={role} color={s.color} bg={s.bg} />;
}

const TH = ({ children, right }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", opacity: .45, textAlign: right ? "right" : "left" }}>
    {children}
  </div>
);

const SECTIONS = ["dashboard", "clients", "cases", "payments", "documents", "followups", "settings", "team"];

function PermissionsModal({ title, initialPerms, onSave, onClose }) {
  const [perms, setPerms] = useState(initialPerms || {});

  const toggle = (s) => {
    setPerms(prev => ({ ...prev, [s]: !Boolean(prev[s]) }));
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)",
      display: "grid", placeItems: "center", zIndex: 10000, padding: 20
    }}>
      <Card style={{ padding: 28, width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "var(--color-text)", opacity: 0.5 }}>×</button>
        </div>
        
        <p style={{ margin: 0, fontSize: 13, opacity: 0.6 }}>Enable or disable specific sections for this {title.toLowerCase().includes("org") ? "organization" : "user"}.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 12 }}>
          {SECTIONS.map(s => (
            <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer", fontWeight: 500 }}>
              <input 
                type="checkbox" 
                checked={Boolean(perms[s])} 
                onChange={() => toggle(s)}
                style={{ width: 16, height: 16, accentColor: "var(--color-primary)" }}
              />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </label>
          ))}
        </div>
        
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button className="btn-gold" style={{ flex: 1, padding: "12px" }} onClick={() => onSave(perms)}>Save Permissions</button>
          <button onClick={onClose} style={{ flex: 1, background: "transparent", border: "1px solid var(--color-border)", borderRadius: 10, color: "var(--color-text)", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
        </div>
      </Card>
    </div>
  );
}

function OrgPermissionsModal({ org, onClose, showToast }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("get_org_permissions", { target_org_id: org.id })
      .then(({ data }) => setPerms(data || {}))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [org.id, showToast]);

  const save = async (fullPerms) => {
    try {
      const final = Object.fromEntries(SECTIONS.map(s => [s, s in fullPerms ? fullPerms[s] : true]));
      const { error } = await supabase.rpc("admin_set_org_permissions", {
        target_org_id: org.id,
        sections_json: final
      });
      if (error) throw error;
      showToast("Organization permissions updated");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
  };

  if (loading) return null;
  return <PermissionsModal title={`Org Perms: ${org.name}`} initialPerms={perms} onSave={save} onClose={onClose} />;
}

function UserPermissionsModal({ user, onClose, showToast }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.rpc("get_user_permissions", { target_user_id: user.id })
      .then(({ data }) => setPerms(data || {}))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [user.id, showToast]);

  const save = async (fullPerms) => {
    try {
      const final = Object.fromEntries(SECTIONS.map(s => [s, s in fullPerms ? fullPerms[s] : true]));
      const { error } = await supabase.rpc("admin_set_user_permissions", {
        target_user_id: user.id,
        sections_json: final
      });
      if (error) throw error;
      showToast("User permissions updated");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
  };

  if (loading) return null;
  return <PermissionsModal title={`User Perms: ${user.email}`} initialPerms={perms} onSave={save} onClose={onClose} />;
}

/* ── TAB: Dashboard ── */
function TabDashboard({ orgs, users, platformAdmins }) {
  const active  = orgs.filter(o => o.status === "ACTIVE").length;
  const pending = orgs.filter(o => o.status === "PENDING_APPROVAL").length;
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === "ACTIVE").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 16 }}>
        <StatBox label="Total Orgs"      value={orgs.length}       color="var(--color-text)" />
        <StatBox label="Active Orgs"     value={active}            color="#34D399" />
        <StatBox label="Pending Orgs"    value={pending}           color="#FBBF24" />
        <StatBox label="Total Users"     value={totalUsers}        color="#818CF8" />
        <StatBox label="Active Users"    value={activeUsers}       color="#34D399" />
        <StatBox label="Platform Admins" value={platformAdmins.length} color="#C9A34E" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card style={{ padding: 20 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Recent Organizations</p>
          {orgs.slice(0, 5).map(o => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</span>
              <StatusBadge status={o.status} />
            </div>
          ))}
        </Card>
        <Card style={{ padding: 20 }}>
          <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>Recent Users</p>
          {users.slice(0, 5).map(u => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-border)" }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{u.email}</p>
                <p style={{ margin: 0, fontSize: 11, opacity: .5 }}>{u.organization_name || "No org"}</p>
              </div>
              <RoleBadge role={u.role} />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ── TAB: Organizations ── */
function TabOrganizations({ orgs, onRefresh, showToast }) {
  const [filter, setFilter] = useState("ALL");
  const [actioning, setActioning] = useState(null);

  const filtered = filter === "ALL" ? orgs : orgs.filter(o => o.status === filter);

  const handleAction = async (org, action) => {
    if (!window.confirm(`${action} "${org.name}"?`)) return;
    setActioning(org.id);
    try {
      const res = await adminReviewOrganization(org.id, action, org.requested_owner_email);
      showToast(res?.message || "Done");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { setActioning(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["ALL","PENDING_APPROVAL","ACTIVE","REJECTED"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? "var(--color-primary)" : "var(--color-surface)",
            color: filter === f ? "#fff" : "var(--color-text)",
            border: "1px solid var(--color-border)", borderRadius: 10,
            padding: "7px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            {f === "PENDING_APPROVAL" ? "Pending" : f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 190px 70px 120px 210px", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <TH>Organization</TH><TH>Status</TH><TH>Owner Email</TH><TH>Users</TH><TH>Created</TH><TH right>Actions</TH>
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: "center", opacity: .4 }}>No organizations found.</p>}
        {filtered.map(org => (
          <div key={org.id} style={{
            display: "grid", gridTemplateColumns: "1fr 110px 190px 70px 120px 210px",
            gap: 8, padding: "14px 20px", borderBottom: "1px solid var(--color-border)",
            alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                {(org.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{org.name}</p>
                {org.is_demo && <span style={{ fontSize: 10, color: "#8B5CF6", fontWeight: 700 }}>DEMO</span>}
              </div>
            </div>
            <StatusBadge status={org.status} />
            <span style={{ fontSize: 12, opacity: .65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{org.requested_owner_email || "—"}</span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{org.user_count ?? 0}</span>
            <span style={{ fontSize: 12, opacity: .5 }}>{fmtDate(org.created_at)}</span>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button
                onClick={() => setActioning({ type: "PERMS", org })}
                style={{ background: "rgba(201,163,78,.15)", color: "#C9A34E", border: "1px solid rgba(201,163,78,.3)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Perms
              </button>
              {org.status === "PENDING_APPROVAL" && <>
                <button disabled={actioning?.org?.id === org.id} onClick={() => handleAction(org, "APPROVE")}
                  style={{ background: "rgba(52,211,153,.18)", color: "#34D399", border: "1px solid rgba(52,211,153,.35)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {actioning?.org?.id === org.id ? "…" : "Approve"}
                </button>
                <button disabled={actioning?.org?.id === org.id} onClick={() => handleAction(org, "REJECT")}
                  style={{ background: "rgba(248,113,113,.15)", color: "#F87171", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Reject
                </button>
              </>}
              <button
                disabled={actioning?.org?.id === org.id}
                onClick={async () => {
                  if (!window.confirm(`Permanently delete "${org.name}" and ALL its users, cases, clients, payments and documents? This cannot be undone.`)) return;
                  setActioning({ org });
                  try {
                    await adminDeleteOrganization(org.id);
                    showToast("Organization deleted");
                    onRefresh();
                  } catch (e) { showToast(e.message, "error"); }
                  finally { setActioning(null); }
                }}
                style={{ background: "rgba(248,113,113,.15)", color: "#F87171", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "5px 12px", fontSize: 0, fontWeight: 700, cursor: "pointer" }}>
                <span style={{ fontSize: 12 }}>{actioning?.org?.id === org.id ? "Deleting..." : "Delete"}</span>
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
      {actioning?.type === "PERMS" && <OrgPermissionsModal org={actioning.org} onClose={() => setActioning(null)} showToast={showToast} />}
    </div>
  );
}

/* ── TAB: Users ── */
function TabUsers({ users, orgs, onRefresh, showToast }) {
  const [search, setSearch] = useState("");
  const [filterOrg, setFilterOrg] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [actioning, setActioning] = useState(null);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchOrg = filterOrg === "ALL" || u.organization_id === filterOrg;
    const matchStatus = filterStatus === "ALL" || u.status === filterStatus;
    return matchSearch && matchOrg && matchStatus;
  });

  const handleUpdate = async (userId, role, status) => {
    setActioning(userId);
    try {
      await adminUpdateUser(userId, role, status);
      showToast("User updated");
      onRefresh();
    } catch (e) { showToast(e.message, "error"); }
    finally { setActioning(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email or name…"
          style={{ flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }} />
        <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}>
          <option value="ALL">All Orgs</option>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }}>
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING_APPROVAL">Pending</option>
        </select>
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 160px 150px", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <TH>User</TH><TH>Role</TH><TH>Status</TH><TH>Organization</TH><TH right>Actions</TH>
        </div>
        {filtered.length === 0 && <p style={{ padding: 40, textAlign: "center", opacity: .4 }}>No users found.</p>}
        {filtered.map(u => (
          <div key={u.id} style={{
            display: "grid", gridTemplateColumns: "1fr 120px 120px 160px 150px",
            gap: 8, padding: "13px 20px", borderBottom: "1px solid var(--color-border)", alignItems: "center",
            opacity: actioning === u.id ? .5 : 1,
          }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{u.full_name || "—"}</p>
              <p style={{ margin: 0, fontSize: 12, opacity: .55 }}>{u.email}
                {u.is_platform_admin && <span style={{ marginLeft: 6, fontSize: 10, color: "#C9A34E", fontWeight: 800 }}>★ PLATFORM</span>}
              </p>
            </div>
            <select value={u.role} onChange={e => handleUpdate(u.id, e.target.value, null)}
              disabled={actioning === u.id}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}>
              <option value="ADMIN">Admin</option>
              <option value="LAWYER">Lawyer</option>
              <option value="STAFF">Staff</option>
              <option value="USER">User</option>
            </select>
            <select value={u.status} onChange={e => handleUpdate(u.id, null, e.target.value)}
              disabled={actioning === u.id}
              style={{ fontSize: 12, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PENDING_APPROVAL">Pending</option>
            </select>
            <span style={{ fontSize: 12, opacity: .6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.organization_name || "—"}</span>
            <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
              <button
                onClick={() => setActioning({ type: "PERMS", user: u })}
                style={{ background: "rgba(201,163,78,.15)", color: "#C9A34E", border: "1px solid rgba(201,163,78,.3)", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Perms
              </button>
              <span style={{ fontSize: 11, opacity: .35 }}>{fmtDate(u.created_at)}</span>
              <button
                disabled={actioning?.user?.id === u.id}
                onClick={async () => {
                  if (!window.confirm(`Permanently delete user "${u.email}"? This removes their auth account and cannot be undone.`)) return;
                  setActioning({ user: u });
                  try {
                    await adminDeleteUser(u.id);
                    showToast("User deleted");
                    onRefresh();
                  } catch (e) { showToast(e.message, "error"); }
                  finally { setActioning(null); }
                }}
                style={{ background: "rgba(248,113,113,.15)", color: "#F87171", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "4px 10px", fontSize: 0, fontWeight: 700, cursor: "pointer" }}>
                <span style={{ fontSize: 11 }}>{actioning?.user?.id === u.id ? "Deleting..." : "Delete"}</span>
                🗑️
              </button>
            </div>
          </div>
        ))}
      </Card>
      {actioning?.type === "PERMS" && <UserPermissionsModal user={actioning.user} onClose={() => setActioning(null)} showToast={showToast} />}
    </div>
  );
}

/* ── TAB: Platform Admins ── */
function TabAdmins({ admins, onRefresh, showToast }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await adminAddPlatformAdmin(email.trim());
      showToast("Platform admin added");
      setEmail("");
      onRefresh();
    } catch (err) { showToast(err.message, "error"); }
    finally { setLoading(false); }
  };

  const handleRemove = async (adminEmail) => {
    if (!window.confirm(`Remove ${adminEmail} as platform admin?`)) return;
    try {
      await adminRemovePlatformAdmin(adminEmail);
      showToast("Platform admin removed");
      onRefresh();
    } catch (err) { showToast(err.message, "error"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card style={{ padding: 20 }}>
        <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: 14 }}>➕ Add Platform Admin</p>
        <form onSubmit={handleAdd} style={{ display: "flex", gap: 10 }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="admin@example.com" required disabled={loading}
            style={{ flex: 1, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)", fontSize: 13 }} />
          <button type="submit" className="btn-gold" disabled={loading || !email.trim()}>
            {loading ? "Adding…" : "Add Admin"}
          </button>
        </form>
        <p style={{ margin: "10px 0 0", fontSize: 12, opacity: .5 }}>
          ⚠️ The user must already have an account in the system before being promoted.
        </p>
      </Card>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px 100px", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <TH>Email</TH><TH>Full Name</TH><TH>Added</TH><TH right>Action</TH>
        </div>
        {admins.length === 0 && <p style={{ padding: 40, textAlign: "center", opacity: .4 }}>No platform admins found.</p>}
        {admins.map(a => (
          <div key={a.id} style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 120px 100px",
            gap: 8, padding: "13px 20px", borderBottom: "1px solid var(--color-border)", alignItems: "center",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{a.email}</span>
            <span style={{ fontSize: 13, opacity: .7 }}>{a.full_name || "—"}</span>
            <span style={{ fontSize: 12, opacity: .5 }}>{fmtDate(a.created_at)}</span>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => handleRemove(a.email)}
                style={{ background: "rgba(248,113,113,.15)", color: "#F87171", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ── TAB: Activity Log ── */
function TabLogs({ logs }) {
  const actionColor = {
    APPROVE_ORGANIZATION: "#34D399",
    REJECT_ORGANIZATION:  "#F87171",
    ADD_PLATFORM_ADMIN:   "#C9A34E",
    REMOVE_PLATFORM_ADMIN:"#F87171",
    UPDATE_USER:          "#818CF8",
    DELETE_ORGANIZATION:  "#F87171",
    DELETE_USER:          "#F87171",
  };

  return (
    <Card>
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 200px", gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--color-border)" }}>
        <TH>Time</TH><TH>Action</TH><TH>Target</TH><TH>Actor</TH>
      </div>
      {logs.length === 0 && <p style={{ padding: 40, textAlign: "center", opacity: .4 }}>No activity recorded yet.</p>}
      {logs.map(l => (
        <div key={l.id} style={{
          display: "grid", gridTemplateColumns: "160px 1fr 1fr 200px",
          gap: 8, padding: "12px 20px", borderBottom: "1px solid var(--color-border)", alignItems: "center",
        }}>
          <span style={{ fontSize: 12, opacity: .5 }}>{fmtTime(l.created_at)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: actionColor[l.action] || "var(--color-text)" }}>
            {l.action.replace(/_/g, " ")}
          </span>
          <span style={{ fontSize: 12, opacity: .7 }}>{l.target_label || l.target_id || "—"}</span>
          <span style={{ fontSize: 12, opacity: .55 }}>{l.actor_email}</span>
        </div>
      ))}
    </Card>
  );
}

/* ── MAIN ── */
/* ── TAB: Create Organization ── */
function TabCreateOrg({ onRefresh, showToast }) {
  const [orgName,     setOrgName]     = useState("");
  const [adminEmail,  setAdminEmail]  = useState("");
  const [loading,     setLoading]     = useState(false);
  const [result,      setResult]      = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim() || !adminEmail.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await adminCreateOrganization({
        orgName:    orgName.trim(),
        adminEmail: adminEmail.trim(),
      });
      setResult(data);
      showToast("Organization created successfully!");
      setOrgName("");
      setAdminEmail("");
      onRefresh();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      {/* Form */}
      <Card style={{ padding: 24 }}>
        <p style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 16 }}>🏢 Create New Organization</p>
        <p style={{ margin: "0 0 20px", fontSize: 13, opacity: .5 }}>
          Creates the organization and admin account, then sends a secure setup email.
          The admin must reset their password on first login.
        </p>

        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>
            Organization Name *
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. Sharma & Associates"
              required
              disabled={loading}
              style={{
                padding: "10px 14px", borderRadius: 10,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)", color: "var(--color-text)",
                fontSize: 13, outline: "none",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>
            Admin Email Address *
            <input
              type="email"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              placeholder="admin@sharmalaw.com"
              required
              disabled={loading}
              style={{
                padding: "10px 14px", borderRadius: 10,
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)", color: "var(--color-text)",
                fontSize: 13, outline: "none",
              }}
            />
          </label>

          <div style={{
            padding: "12px 14px",
            background: "rgba(201,163,78,.07)", border: "1px solid rgba(201,163,78,.2)",
            borderRadius: 10, fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.6,
          }}>
            ℹ️ Account creation and email delivery run server-side. The temporary password is sent directly to the admin and is never exposed in the browser.
          </div>

          <button
            type="submit"
            disabled={loading || !orgName.trim() || !adminEmail.trim()}
            className="btn-gold"
            style={{ marginTop: 4, padding: "11px 24px", fontSize: 14, fontWeight: 700 }}
          >
            {loading ? "Creating…" : "✨ Create Organization & Admin"}
          </button>
        </form>
      </Card>

      {/* Result panel (shown once after successful creation) */}
      {result && (
        <Card style={{
          padding: 24,
          border: "1px solid rgba(52,211,153,.3)",
          background: "rgba(52,211,153,.05)",
        }}>
          <p style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 15, color: "#34D399" }}>
            ✅ Organization Created Successfully
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              ["Organization", result.adminEmail ? result.adminEmail.split("@")[1]?.split(".")[0] || "—" : "—"],
              ["Admin Email",  result.adminEmail  || result.admin_email || "—"],
              ["Org ID",       (result.organizationId || result.organization_id || "").slice(0, 8) + "…"],
              ["Status",       "ACTIVE"],
            ].map(([k, v]) => (
              <div key={k} style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ margin: 0, fontSize: 10, opacity: .45, textTransform: "uppercase", letterSpacing: ".06em" }}>{k}</p>
                <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 700 }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Invite delivery status */}
          <div style={{
            background: result.emailSent === false ? "rgba(248,113,113,.08)" : "rgba(52,211,153,.08)",
            border: result.emailSent === false ? "1px solid rgba(248,113,113,.3)" : "1px solid rgba(52,211,153,.3)",
            borderRadius: 10, padding: "14px 16px",
          }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: result.emailSent === false ? "#F87171" : "#34D399" }}>
              {result.emailSent === false ? "Invite email failed" : "Invite email sent"}
            </p>
            <p style={{ margin: "10px 0 0", fontSize: 11, opacity: .45 }}>
              {result.message || "The admin received a secure setup link and temporary password by email."}
            </p>
          </div>

          <button
            onClick={() => setResult(null)}
            style={{
              marginTop: 14, background: "transparent", border: "1px solid var(--color-border)",
              borderRadius: 8, padding: "7px 16px", fontSize: 12, color: "var(--color-text)",
              cursor: "pointer", opacity: .6,
            }}
          >
            Dismiss
          </button>
        </Card>
      )}
    </div>
  );
}

/* ── TAB list ── */
const TABS = [
  { key: "dashboard",    label: "📊 Dashboard" },
  { key: "create-org",   label: "➕ Create Org" },
  { key: "orgs",        label: "🏢 Organizations" },
  { key: "users",       label: "👥 Users" },
  { key: "admins",      label: "⭐ Platform Admins" },
  { key: "logs",        label: "📋 Activity Log" },
];

export default function SuperAdminDashboard() {
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);

  const [orgs, setOrgs]         = useState([]);
  const [users, setUsers]       = useState([]);
  const [admins, setAdmins]     = useState([]);
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, u, a, l] = await Promise.all([
        adminListOrganizations("ALL"),
        adminListAllUsers(),
        adminListPlatformAdmins(),
        adminGetActivityLog(50),
      ]);
      setOrgs(o); setUsers(u); setAdmins(a); setLogs(l);
    } catch (e) { showToast(e.message, "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const init = async () => {
      if (isPlatformAdmin()) { setAuthorized(true); setReady(true); return; }
      const { isPlatformAdmin: isAdmin } = await checkAdminStatus({ force: true });
      setAuthorized(isAdmin);
      setReady(true);
    };
    void init();
  }, []);

  useEffect(() => { if (authorized) void loadAll(); }, [authorized, loadAll]);

  if (!ready) return <div className="page-loader"><p>Checking permissions…</p></div>;

  if (!authorized) return (
    <div className="page-loader" style={{ flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 22, fontWeight: 800, color: "var(--color-gold)" }}>Access Denied</p>
      <p style={{ opacity: .6 }}>Platform administrator privileges required.</p>
    </div>
  );

  return (
    <AppShell title="Platform Admin" subtitle="Super admin control panel">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 4, background: "var(--color-surface)",
        border: "1px solid var(--color-border)", borderRadius: 14,
        padding: 5, marginBottom: 24, flexWrap: "wrap",
        backdropFilter: "blur(12px)",
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: tab === t.key ? "var(--color-primary)" : "transparent",
            color: tab === t.key ? "#fff" : "var(--color-text)",
            border: "none", borderRadius: 10, padding: "9px 18px",
            fontWeight: 600, fontSize: 13, cursor: "pointer",
            opacity: tab === t.key ? 1 : .6, transition: "all .18s",
            whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
        <button onClick={() => { void loadAll(); showToast("Refreshed"); }}
          disabled={loading}
          style={{ marginLeft: "auto", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 10, padding: "9px 16px", fontSize: 13, cursor: "pointer", color: "var(--color-text)", opacity: .6 }}>
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      <div style={{ paddingBottom: 40 }}>
        {tab === "dashboard" && <TabDashboard orgs={orgs} users={users} platformAdmins={admins} />}
        {tab === "create-org" && <TabCreateOrg onRefresh={loadAll} showToast={showToast} />}
        {tab === "orgs"      && <TabOrganizations orgs={orgs} onRefresh={loadAll} showToast={showToast} />}
        {tab === "users"     && <TabUsers users={users} orgs={orgs} onRefresh={loadAll} showToast={showToast} />}
        {tab === "admins"    && <TabAdmins admins={admins} onRefresh={loadAll} showToast={showToast} />}
        {tab === "logs"      && <TabLogs logs={logs} />}
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AppShell>
  );
}




