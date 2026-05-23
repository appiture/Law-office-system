import { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabaseClient";
import AppShell from "../components/layout/AppShell";
import {
  isOrgAdmin,
  listOrganizationMembers,
  adminInviteTeamMember,
  updateOrganizationMember,
  removeOrganizationMember,
} from "../services/adminService";
import { getUserId } from "../services/authService";
import HeaderFilters from "../components/HeaderFilters";
import { openExport } from "../store/exportStore";
import "./formStyles.css";

const SECTIONS = ["dashboard", "clients", "cases", "payments", "documents", "hearings", "tasks", "settings", "team"];
const STAFF_INVITE_SECTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clients", label: "Clients" },
  { key: "cases", label: "Matters" },
  { key: "payments", label: "Fees" },
  { key: "documents", label: "Documents" },
  { key: "hearings", label: "Hearings" },
  { key: "tasks", label: "Tasks" },
  { key: "settings", label: "Settings" },
  { key: "team", label: "Team" },
];

const defaultStaffPermissions = {
  dashboard: true,
  clients: true,
  cases: true,
  payments: false,
  documents: false,
  hearings: true,
  tasks: true,
  settings: false,
  team: false,
};

function UserPermissionsModal({ user, onClose, showToast }) {
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = user.role === "ADMIN";

  useEffect(() => {
    supabase.rpc("get_user_permissions", { target_user_id: user.id })
      .then(({ data, error }) => {
        if (error) showToast(error.message, "error");
        else setPerms(data || {});
      })
      .finally(() => setLoading(false));
  }, [user.id, showToast]);

  const save = async (fullPerms) => {
    if (isAdmin) return; // admins always have full access
    setSaving(true);
    try {
      const final = Object.fromEntries(SECTIONS.map(s => [s, s in fullPerms ? fullPerms[s] : true]));
      const { data, error } = await supabase.rpc("admin_set_user_permissions", {
        target_user_id: user.id,
        sections_json: final,
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.message || "Failed to save");
      showToast("Permissions updated for " + (user.full_name || user.email));
      // Tell PermissionsContext to re-fetch (takes effect if this user is viewing another tab)
      window.dispatchEvent(new CustomEvent("permissionsChanged"));
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 10000 }}>
      <div style={{ background: "var(--color-card)", borderRadius: 20, padding: "32px 40px", color: "var(--color-text-secondary)", fontSize: 14 }}>Loading permissions…</div>
    </div>
  );

  const SECTION_LABELS = {
    dashboard: "Dashboard", clients: "Clients", cases: "Cases / Matters",
    payments: "Payments / Fees", documents: "Documents", hearings: "Hearings",
    tasks: "Tasks", settings: "Settings", team: "Team",
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
      display: "grid", placeItems: "center", zIndex: 10000, padding: 20
    }}>
      <div style={{
        background: "var(--color-card)", border: "1px solid var(--color-border)",
        borderRadius: 24, padding: 32, width: "100%", maxWidth: 500,
        display: "flex", flexDirection: "column", gap: 20,
        boxShadow: "0 25px 60px -12px rgba(0,0,0,0.5)",
        color: "var(--color-text)"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>🔐 Page Permissions</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              {user.full_name || user.email}
              <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color:
                user.role === "ADMIN" ? "#C9A34E" : user.role === "LAWYER" ? "#818CF8" : "#94A3B8"
              }}>{user.role}</span>
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)", width: 32, height: 32,
            borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 18, transition: "all 0.2s"
          }}>×</button>
        </div>

        {/* Admin lock banner */}
        {isAdmin && (
          <div style={{
            background: "rgba(201,163,78,0.08)", border: "1px solid rgba(201,163,78,0.25)",
            borderRadius: 12, padding: "12px 16px", fontSize: 13,
            color: "var(--color-text-secondary)", lineHeight: 1.5,
          }}>
            <strong style={{ color: "#C9A34E" }}>Admin role</strong> — Admins always have full access to all sections. Individual page restrictions do not apply.
          </div>
        )}

        {/* Permissions grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          background: "var(--color-bg)", padding: 16, borderRadius: 14,
          border: "1px solid var(--color-border)",
          opacity: isAdmin ? 0.5 : 1,
        }}>
          {SECTIONS.map(s => (
            <label key={s} style={{
              display: "flex", alignItems: "center", gap: 10, fontSize: 13,
              cursor: isAdmin ? "not-allowed" : "pointer",
              fontWeight: 600,
              color: (isAdmin || perms[s]) ? "var(--color-text)" : "var(--color-text-secondary)",
              padding: "9px 12px", borderRadius: 10, transition: "all 0.2s",
              background: (isAdmin || perms[s]) ? "var(--color-bg-secondary)" : "transparent",
              border: (isAdmin || perms[s]) ? "1px solid var(--color-border)" : "1px solid transparent",
            }}>
              <input
                type="checkbox"
                checked={isAdmin ? true : Boolean(perms[s])}
                disabled={isAdmin}
                onChange={() => !isAdmin && setPerms(prev => ({ ...prev, [s]: !prev[s] }))}
                style={{ width: 16, height: 16, cursor: isAdmin ? "not-allowed" : "pointer", accentColor: "var(--color-primary)" }}
              />
              {SECTION_LABELS[s] || s}
            </label>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {!isAdmin && (
            <button
              className="btn-gold"
              disabled={saving}
              style={{ flex: 2, padding: "12px", fontSize: 14, fontWeight: 700 }}
              onClick={() => save(perms)}
            >
              {saving ? "Saving…" : "Save Permissions"}
            </button>
          )}
          <button onClick={onClose} style={{
            flex: isAdmin ? 1 : 1,
            background: "transparent", border: "1px solid var(--color-border)",
            borderRadius: 12, color: "var(--color-text-secondary)", cursor: "pointer",
            fontWeight: 600, fontSize: 14, padding: "12px", transition: "all 0.2s"
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Role badge ───────────────────────────────────────────────────── */
function RoleBadge({ role }) {
  const map = {
    ADMIN:  { bg: "rgba(201,163,78,0.15)",  color: "#C9A34E",  label: "Admin" },
    LAWYER: { bg: "rgba(99,102,241,0.15)",  color: "#818CF8",  label: "Lawyer" },
    STAFF:  { bg: "rgba(100,116,139,0.15)", color: "#94A3B8",  label: "Staff" },
  };
  const s = map[role] || { bg: "rgba(148,163,184,0.1)", color: "#94A3B8", label: role };
  return (
    <span style={{
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}44`,
      borderRadius: 20, padding: "3px 10px",
      fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
    }}>
      {s.label}
    </span>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────── */
function MemberAvatar({ name, avatarUrl }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  if (avatarUrl && !broken) {
    return (
      <img src={avatarUrl} alt={name} onError={() => setBroken(true)}
        style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: 38, height: 38, borderRadius: 10,
      background: "var(--color-primary)", color: "var(--color-bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: 14, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

/* ── Password-result panel (shown once after invite) ─────────────── */
function TempPasswordPanel({ result, onDismiss }) {
  const roleColor = result.role === "LAWYER" ? "#818CF8" : "#94A3B8";
  const invitedEmail = result.email || result.admin_email || "";
  const emailOk = result.emailSent !== false;

  return (
    <div style={{
      background: "rgba(52,211,153,0.04)",
      border: "1px solid rgba(52,211,153,0.28)",
      borderRadius: 20, padding: 24,
      backdropFilter: "blur(12px)",
      boxShadow: "0 4px 32px rgba(0,0,0,0.1)",
      animation: "slideDown 0.25s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#34D399" }}>
            Team member added successfully
          </p>
        </div>
        <button onClick={onDismiss} style={{
          background: "transparent", border: "none",
          color: "var(--color-text)", fontSize: 18, cursor: "pointer", opacity: 0.4,
          lineHeight: 1, padding: "2px 6px",
        }}>✕</button>
      </div>

      {/* Details grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[
          ["Email", invitedEmail || "—"],
          ["Role",  result.role || "—"],
        ].map(([k, v]) => (
          <div key={k} style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px",
          }}>
            <p style={{ margin: 0, fontSize: 10, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</p>
            <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: k === "Role" ? roleColor : "var(--color-text)" }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Invite delivery block */}
      <div style={{
        background: emailOk ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
        border: emailOk ? "1px solid rgba(52,211,153,0.28)" : "1px solid rgba(248,113,113,0.28)",
        borderRadius: 12, padding: "16px 18px",
      }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: emailOk ? "#34D399" : "#F87171" }}>
          {emailOk ? "Invite email sent" : "Invite email failed"}
        </p>

        <p style={{ margin: "10px 0 0", fontSize: 11, opacity: 0.45, lineHeight: 1.5 }}>
          {result.message || "The member received a secure setup link and temporary password by email. They will be asked to set a new password immediately."}
        </p>
      </div>

      {/* Login instructions */}
      <div style={{
        marginTop: 14,
        background: "rgba(201,163,78,0.06)",
        border: "1px solid rgba(201,163,78,0.18)",
        borderRadius: 10, padding: "12px 14px",
        fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7,
      }}>
        <strong style={{ color: "var(--color-gold)" }}>📋 What to tell the member:</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Open the invite email sent to <strong style={{ color: "var(--color-text)" }}>{invitedEmail}</strong></li>
          <li>Use the setup button or the temporary password in that email</li>
          <li>The account will be prompted to set a new password</li>
        </ol>
      </div>
    </div>
  );
}

/* ── Invite form ──────────────────────────────────────────────────── */
function InviteForm({ onInvited }) {
  const [email,   setEmail]   = useState("");
  const [role,    setRole]    = useState("LAWYER");
  const [staffPermissions, setStaffPermissions] = useState(defaultStaffPermissions);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [result,  setResult]  = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await adminInviteTeamMember({ email: email.trim(), role });
      if (!res.success) throw new Error(res.message);
      let finalData = res.data;

      if ((role === "STAFF" || role === "LAWYER") && finalData?.userId) {
        const sectionsJson = Object.fromEntries(SECTIONS.map((section) => [
          section,
          section in staffPermissions ? staffPermissions[section] : true,
        ]));
        const { error: permissionsError } = await supabase.rpc("admin_set_user_permissions", {
          target_user_id: finalData.userId,
          sections_json: sectionsJson,
        });
        if (permissionsError) {
          finalData = {
            ...finalData,
            message: `${res.message || "Team member invited."} Permissions could not be saved: ${permissionsError.message}`,
          };
        }
      }

      setResult(finalData);
      setEmail("");
      setRole("LAWYER");
      setStaffPermissions(defaultStaffPermissions);
      onInvited?.();
    } catch (err) {
      setError(err.message || "Failed to add team member. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Form card */}
      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 20, padding: 24,
        backdropFilter: "blur(12px)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
      }}>
        <div className="form-section-title" style={{ marginBottom: 4 }}>
          <span>👤</span> Add Team Member
        </div>
        <p style={{ margin: "0 0 18px", fontSize: 13, opacity: 0.5 }}>
          Enter the email address and role. A login account will be created server-side and the setup email will be sent securely.
        </p>

        {error && (
          <div className="form-error-banner" style={{ marginBottom: 14 }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px auto",
            gap: 12, alignItems: "end",
          }}>
            <div className="field-group" style={{ margin: 0 }}>
              <label className="field-label">Email Address *</label>
              <input
                type="email"
                placeholder="lawyer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="field-group" style={{ margin: 0 }}>
              <label className="field-label">Role *</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}>
                <option value="LAWYER">⚖️ Lawyer</option>
                <option value="STAFF">🗂️ Staff</option>
                <option value="ADMIN">🔑 Admin</option>
              </select>
            </div>
            <button
              type="submit"
              className="btn-gold"
              disabled={loading || !email.trim()}
              style={{ alignSelf: "end", whiteSpace: "nowrap" }}
            >
              {loading ? "Creating…" : "✨ Add Member"}
            </button>
          </div>



          {/* Info hint */}
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "rgba(201,163,78,0.06)",
            border: "1px solid rgba(201,163,78,0.18)",
            borderRadius: 10, fontSize: 12, color: "rgba(255,255,255,0.5)",
            lineHeight: 1.6,
          }}>
            ℹ️ A secure account is created immediately. The member will receive a setup email and will be required to change their password on first login.
          </div>
        </form>
      </div>

      {/* One-time result panel */}
      {result && (
        <TempPasswordPanel result={result} onDismiss={() => setResult(null)} />
      )}
    </div>
  );
}

/* ── Member row ───────────────────────────────────────────────────── */
function MemberRow({ member, currentUserId, onUpdated, onRemoved, onEditPerms }) {
  const [roleEditing,  setRoleEditing]  = useState(false);
  const [selectedRole, setSelectedRole] = useState(member.role);
  const [loading,      setLoading]      = useState(false);
  const isSelf = member.id === currentUserId;

  const handleRoleChange = async (newRole) => {
    if (newRole === member.role) { setRoleEditing(false); return; }
    setLoading(true);
    try {
      const res = await updateOrganizationMember(member.id, newRole, null);
      if (!res.success) throw new Error(res.message);
      onUpdated?.();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); setRoleEditing(false); }
  };

  const handleStatusToggle = async () => {
    const newStatus = member.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setLoading(true);
    try {
      const res = await updateOrganizationMember(member.id, null, newStatus);
      if (!res.success) throw new Error(res.message);
      onUpdated?.();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from the organization?`)) return;
    setLoading(true);
    try {
      const res = await removeOrganizationMember(member.id);
      if (!res.success) throw new Error(res.message);
      onRemoved?.();
    } catch (err) { alert("Error: " + err.message); }
    finally { setLoading(false); }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 130px 120px 170px",
        padding: "14px 24px",
        borderBottom: "1px solid var(--color-border)",
        alignItems: "center", gap: 8,
        opacity: loading ? 0.6 : 1,
        transition: "background 0.15s, opacity 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, overflow: "hidden" }}>
        <MemberAvatar name={member.full_name || member.email} avatarUrl={member.avatar_url} />
        <div style={{ overflow: "hidden" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {member.full_name || "—"}
            {member.must_reset_password && (
              <span title="Pending first-login password reset" style={{
                marginLeft: 8, fontSize: 10, color: "#FBBF24",
                background: "rgba(251,191,36,0.1)", borderRadius: 20,
                padding: "2px 7px", fontWeight: 700, border: "1px solid rgba(251,191,36,0.3)",
              }}>
                🔐 Pending Reset
              </span>
            )}
          </p>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.55, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {member.email}
            {isSelf && (
              <span style={{ marginLeft: 6, fontSize: 10, color: "var(--color-gold)", fontWeight: 700 }}>(you)</span>
            )}
          </p>
        </div>
      </div>

      {/* Role */}
      <div>
        {roleEditing && !isSelf ? (
          <select
            value={selectedRole} autoFocus
            onChange={(e) => { setSelectedRole(e.target.value); handleRoleChange(e.target.value); }}
            onBlur={() => setRoleEditing(false)}
            style={{ fontSize: 13, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          >
            <option value="ADMIN">Admin</option>
            <option value="LAWYER">Lawyer</option>
            <option value="STAFF">Staff</option>
          </select>
        ) : (
          <span onClick={() => !isSelf && setRoleEditing(true)}
            title={isSelf ? undefined : "Click to change role"}
            style={{ cursor: isSelf ? "default" : "pointer" }}>
            <RoleBadge role={member.role} />
          </span>
        )}
      </div>

      {/* Status */}
      <div>
        <span style={{
          background: member.status === "ACTIVE" ? "rgba(52,211,153,0.15)" : "rgba(148,163,184,0.1)",
          color:      member.status === "ACTIVE" ? "#34D399" : "#94A3B8",
          borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700,
          border:     member.status === "ACTIVE" ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(148,163,184,0.2)",
        }}>
          {member.status === "ACTIVE" ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {!isSelf && (
          <>
            <button
              onClick={() => onEditPerms?.(member)}
              style={{
                background: "rgba(201,163,78,0.18)", color: "#C9A34E",
                border: "1px solid rgba(201,163,78,0.4)", borderRadius: 10,
                padding: "6px 14px", fontSize: 13, fontWeight: 800,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.2s"
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,163,78,0.3)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(201,163,78,0.18)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              🔐 Perms
            </button>
            <button
              onClick={handleStatusToggle}
              disabled={loading}
              style={{
                background: "transparent", border: "1px solid var(--color-border)",
                borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600,
                cursor: "pointer", color: "var(--color-text)", opacity: 0.65,
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.65")}
            >
              {member.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </button>
            <button
              onClick={handleRemove}
              disabled={loading}
              style={{
                background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)",
                borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", color: "#F87171", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.25)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(248,113,113,0.12)")}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */
export default function TeamManagement() {
  const [authorized,   setAuthorized]   = useState(isOrgAdmin());
  const [members,      setMembers]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [toast,        setToast]        = useState(null);
  const [search,       setSearch]       = useState("");
  const [filterRole,   setFilterRole]   = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [editingPerms, setEditingPerms] = useState(null);
  const currentUserId = getUserId();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOrganizationMembers();
      setMembers(res.data || []);
    } catch (err) {
      showToast(err.message || "Failed to load team members", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setAuthorized(isOrgAdmin());
    if (isOrgAdmin()) void loadMembers();
  }, [loadMembers]);

  if (!authorized) {
    return (
      <div className="page-loader" style={{ flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 22, fontWeight: 800, color: "var(--color-gold)" }}>Admin Only</p>
        <p style={{ opacity: 0.6, maxWidth: 380, textAlign: "center", lineHeight: 1.6 }}>
          Only organization administrators can access Team Management.
        </p>
      </div>
    );
  }

  const searchTokens = search.toLowerCase().replace(/[_-]+/g, " ").split(/\s+/).filter(Boolean);
  const filtered = members.filter((m) => {
    const haystack = [m.email, m.full_name, m.role, m.status].filter(Boolean).join(" ").toLowerCase();
    const matchSearch = searchTokens.every((token) => haystack.includes(token));
    const matchRole = filterRole === "ALL" || m.role === filterRole;
    const matchStatus = filterStatus === "ALL" || m.status === filterStatus;
    let matchDate = true;
    if (filterFromDate || filterToDate) {
      if (!m.created_at) matchDate = false;
      else {
        const d = new Date(m.created_at);
        if (filterFromDate && d < new Date(filterFromDate)) matchDate = false;
        if (filterToDate && d > new Date(filterToDate)) matchDate = false;
      }
    }
    return matchSearch && matchRole && matchStatus && matchDate;
  });

  const activeCount  = members.filter((m) => m.status === "ACTIVE").length;
  const lawyerCount  = members.filter((m) => m.role === "LAWYER").length;
  const adminCount   = members.filter((m) => m.role === "ADMIN").length;
  const pendingCount = members.filter((m) => m.must_reset_password).length;

  return (
    <AppShell
      title="Team Management"
      subtitle="Add and manage your organization's members"
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
          <button
            type="button"
            className="btn-gold header-action-btn"
            onClick={() => openExport({
              type: "team",
              availableData: filtered.map(m => ({
                name: m.full_name || m.name || m.email,
                email: m.email,
                role: m.role,
                status: m.status,
                createdAt: m.created_at,
              }))
            })}
          >
            📊 Export Team
          </button>
        </div>
      }
    >

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9998,
          background: toast.type === "error" ? "#F87171" : "#34D399",
          color: "#0f172a", padding: "12px 20px", borderRadius: 12,
          fontWeight: 700, fontSize: 14,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          animation: "slideDown 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16 }}>
          {[
            { label: "Total Members", value: members.length,  accent: "var(--color-text)" },
            { label: "Active",        value: activeCount,      accent: "#34D399" },
            { label: "Lawyers",       value: lawyerCount,      accent: "#818CF8" },
            { label: "Admins",        value: adminCount,       accent: "#C9A34E" },
            { label: "Pending Reset", value: pendingCount,     accent: "#FBBF24" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              borderRadius: 16, padding: "18px 22px",
              backdropFilter: "blur(12px)", boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
            }}>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</p>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: s.accent, lineHeight: 1.2 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Invite form + result */}
        <InviteForm onInvited={() => { loadMembers(); showToast("Team member added!"); }} />

      <HeaderFilters
        searchTerm={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search members by any word..."
        filters={[
          {
            id: "role",
            label: "Role",
            options: [
              { value: "ADMIN", label: "Admin" },
              { value: "LAWYER", label: "Lawyer" },
              { value: "STAFF", label: "Staff" }
            ]
          },
          {
            id: "status",
            label: "Status",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "PENDING", label: "Pending" }
            ]
          }
        ]}
        filterValues={{ role: filterRole, status: filterStatus }}
        onFilterChange={(id, val) => {
          if (id === "role") setFilterRole(val || "ALL");
          if (id === "status") setFilterStatus(val || "ALL");
        }}
        dateRangeConfig={{
          label: "Joined Date",
          fromDate: filterFromDate,
          toDate: filterToDate,
          onFromDateChange: setFilterFromDate,
          onToDateChange: setFilterToDate
        }}
        onClearFilters={() => {
          setSearch("");
          setFilterRole("ALL");
          setFilterStatus("ALL");
          setFilterFromDate("");
          setFilterToDate("");
        }}
        onShowAll={() => {
          setSearch("");
          setFilterRole("ALL");
          setFilterStatus("ALL");
          setFilterFromDate("");
          setFilterToDate("");
        }}
      />

        {/* Members table */}
        <div style={{
          background: "var(--color-surface)", border: "1px solid var(--color-border)",
          borderRadius: 20, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
        }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 130px 120px 170px",
            padding: "14px 24px", borderBottom: "1px solid var(--color-border)",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
            textTransform: "uppercase", opacity: 0.45,
          }}>
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span style={{ textAlign: "right" }}>Actions</span>
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: "center", opacity: 0.5 }}>
              Loading team members…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", opacity: 0.5 }}>
              {members.length === 0
                ? "No members yet. Add a member above."
                : "No members match your search."}
            </div>
          ) : (
            filtered.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                currentUserId={currentUserId}
                onUpdated={loadMembers}
                onRemoved={loadMembers}
                onEditPerms={(m) => setEditingPerms(m)}
              />
            ))
          )}
        </div>

        {editingPerms && (
          <UserPermissionsModal 
            user={editingPerms} 
            onClose={() => setEditingPerms(null)} 
            showToast={showToast} 
          />
        )}

        {/* Hint */}
        <p style={{ fontSize: 12, opacity: 0.4, textAlign: "center", margin: 0 }}>
          💡 Click a role badge to change it inline. The 🔐 Pending Reset badge clears once the member sets their own password.
        </p>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AppShell>
  );
}




