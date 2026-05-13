import { useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";
import AppShell from "../components/AppShell";
import HeaderFilters from "../components/HeaderFilters";
import { isPlatformAdmin } from "../services/adminService";
import dayjs from "dayjs";
import "./SystemAuditLogs.css";

function SystemAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [superAdmin, setSuperAdmin] = useState(false);

  const [filters, setFilters] = useState({
    organizationId: "",
    userId: "",
    module: "",
    actionType: "",
    search: ""
  });

  useEffect(() => {
    const checkAdmin = async () => {
      const isSuper = isPlatformAdmin();
      setSuperAdmin(isSuper);
      if (isSuper) {
        // Fetch organizations for filter
        const { data } = await supabase.from("organizations").select("id, name").order("name");
        if (data) setOrganizations(data);
      }
    };
    checkAdmin();
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("system_audit_logs")
        .select(`
          *,
          organizations(name)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filters.organizationId) {
        query = query.eq("organization_id", filters.organizationId);
      }
      if (filters.userId) {
        query = query.eq("actor_id", filters.userId);
      }
      if (filters.module) {
        query = query.eq("module", filters.module);
      }
      if (filters.actionType) {
        query = query.eq("action_type", filters.actionType);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      let filteredData = data;
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredData = data.filter(log => 
          (log.description && log.description.toLowerCase().includes(searchLower)) ||
          (log.actor_email && log.actor_email.toLowerCase().includes(searchLower)) ||
          (log.entity_name && log.entity_name.toLowerCase().includes(searchLower))
        );
      }

      setLogs(filteredData || []);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.organizationId, filters.userId, filters.module, filters.actionType, filters.search]);

  const getActionColor = (actionType) => {
    if (actionType.includes("CREATE")) return "var(--color-success, green)";
    if (actionType.includes("UPDATE")) return "var(--color-info, blue)";
    if (actionType.includes("DELETE")) return "var(--color-danger, red)";
    if (actionType.includes("ASSIGN")) return "var(--color-warning, orange)";
    if (actionType.includes("LOGIN")) return "var(--color-primary, purple)";
    return "var(--color-text-muted)";
  };

  return (
    <AppShell title="Audit Logs" subtitle="System global audit history">
      <div className="audit-logs-container fade-in">
        <HeaderFilters
          searchTerm={filters.search}
          onSearchChange={(value) => handleFilterChange("search", value)}
          searchPlaceholder="Search logs by any word..."
          filters={[
            ...(superAdmin ? [{
              id: "organizationId",
              label: "Organization",
              options: organizations.map((org) => ({ value: org.id, label: org.name }))
            }] : []),
            {
              id: "module",
              label: "Module",
              options: [
                { value: "users", label: "Users" },
                { value: "cases", label: "Cases" },
                { value: "payments", label: "Payments" },
                { value: "documents", label: "Documents" },
                { value: "platform", label: "Platform" }
              ]
            },
            {
              id: "actionType",
              label: "Action",
              type: "text",
              placeholder: "CREATE, UPDATE, DELETE..."
            }
          ]}
          filterValues={{
            organizationId: filters.organizationId,
            module: filters.module,
            actionType: filters.actionType
          }}
          onFilterChange={handleFilterChange}
          onClearFilters={() => setFilters({ organizationId: "", userId: "", module: "", actionType: "", search: "" })}
          onShowAll={() => setFilters({ organizationId: "", userId: "", module: "", actionType: "", search: "" })}
        />

        <div className="surface-card p-0" style={{ marginTop: '20px', overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">No audit logs found matching the criteria.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  {superAdmin && <th>Organization</th>}
                  <th>User</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dayjs(log.created_at).format("DD MMM YYYY, HH:mm")}</td>
                    {superAdmin && <td>{log.organizations?.name || "System"}</td>}
                    <td>
                      <div>{log.actor_email || "System"}</div>
                      <small style={{ color: "var(--color-text-muted)" }}>{log.actor_role}</small>
                    </td>
                    <td><span className="badge outline">{log.module}</span></td>
                    <td>
                      <span className="badge solid" style={{ backgroundColor: getActionColor(log.action_type), color: "#fff" }}>
                        {log.action_type}
                      </span>
                    </td>
                    <td>{log.entity_name || "-"}</td>
                    <td>{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default SystemAuditLogs;
