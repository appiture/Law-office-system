import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import AppShell from "../components/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getOrganizationId } from "../services/authService";
import "./Tasks.css";

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUS_OPTIONS   = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

const PRIORITY_META = {
  LOW:     { label: "Low",     emoji: "🟢", cls: "priority-low" },
  MEDIUM:  { label: "Medium",  emoji: "🟡", cls: "priority-medium" },
  HIGH:    { label: "High",    emoji: "🟠", cls: "priority-high" },
  URGENT:  { label: "Urgent",  emoji: "🔴", cls: "priority-urgent" },
};

const STATUS_META = {
  PENDING:     { label: "Pending",     emoji: "⏳", cls: "status-pending" },
  IN_PROGRESS: { label: "In Progress", emoji: "🔄", cls: "status-in-progress" },
  COMPLETED:   { label: "Completed",   emoji: "✅", cls: "status-completed" },
  CANCELLED:   { label: "Cancelled",   emoji: "❌", cls: "status-cancelled" },
};

const blankTask = () => ({
  title: "",
  description: "",
  priority: "MEDIUM",
  status: "PENDING",
  dueDate: "",
  assignedTo: "",
});

function formatDueDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isDueSoon(dateStr) {
  if (!dateStr) return false;
  const due = new Date(dateStr);
  const now = new Date();
  const diff = (due - now) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 2;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

/* ── Quick Add Bar ──────────────────────────────────────────────────── */
function QuickAddBar({ onAdd, saving }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const inputRef = useRef(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    onAdd({ title: trimmed, priority, dueDate, description: "", status: "PENDING", assignedTo: "" });
    setTitle("");
    setPriority("MEDIUM");
    setDueDate("");
    inputRef.current?.focus();
  };

  return (
    <div className="tasks-quick-add-bar">
      <input
        ref={inputRef}
        className="tasks-quick-input"
        placeholder="⚡ Quick add task — type and press Enter or click Add…"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        disabled={saving}
      />
      <select
        className="tasks-quick-select"
        value={priority}
        onChange={e => setPriority(e.target.value)}
        disabled={saving}
      >
        {PRIORITY_OPTIONS.map(p => (
          <option key={p} value={p}>{PRIORITY_META[p].emoji} {PRIORITY_META[p].label}</option>
        ))}
      </select>
      <input
        type="date"
        className="tasks-quick-date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        disabled={saving}
        title="Due date (optional)"
      />
      <button type="button" className="btn-gold tasks-quick-btn" onClick={submit} disabled={saving || !title.trim()}>
        {saving ? "Adding…" : "+ Add"}
      </button>
    </div>
  );
}

/* ── Task Card ─────────────────────────────────────────────────────── */
function TaskCard({ task, onEdit, onDelete, onToggleStatus }) {
  const pm = PRIORITY_META[task.priority] || PRIORITY_META.MEDIUM;
  const sm = STATUS_META[task.status]     || STATUS_META.PENDING;
  const overdue = task.status === "PENDING" && isOverdue(task.dueDate);
  const soon    = task.status === "PENDING" && isDueSoon(task.dueDate);

  return (
    <div className={`task-card ${sm.cls} ${overdue ? "task-overdue" : soon ? "task-due-soon" : ""}`}>
      <div className="task-card-top">
        <button
          type="button"
          className={`task-check ${task.status === "COMPLETED" ? "checked" : ""}`}
          onClick={() => onToggleStatus(task)}
          title={task.status === "COMPLETED" ? "Mark as Pending" : "Mark as Complete"}
        >
          {task.status === "COMPLETED" ? "✓" : ""}
        </button>

        <div className="task-card-body">
          <div className="task-card-title-row">
            <span className={`task-title ${task.status === "COMPLETED" ? "task-done-strike" : ""}`}>
              {task.title}
            </span>
            <span className={`task-priority-badge ${pm.cls}`}>{pm.emoji} {pm.label}</span>
          </div>

          {task.description && (
            <p className="task-description">{task.description}</p>
          )}

          <div className="task-card-meta">
            <span className={`task-status-chip ${sm.cls}`}>{sm.emoji} {sm.label}</span>

            {task.dueDate && (
              <span className={`task-due-chip ${overdue ? "chip-overdue" : soon ? "chip-soon" : ""}`}>
                📅 {formatDueDate(task.dueDate)}
                {overdue && " · Overdue"}
                {soon && !overdue && " · Due Soon"}
              </span>
            )}

            {task.assignedTo && (
              <span className="task-assignee-chip">👤 {task.assignedTo}</span>
            )}
          </div>
        </div>

        <div className="task-card-actions">
          <button type="button" className="task-action-btn task-edit-btn" onClick={() => onEdit(task)} title="Edit">✏️</button>
          <button type="button" className="task-action-btn task-del-btn" onClick={() => onDelete(task)} title="Delete">🗑️</button>
        </div>
      </div>
    </div>
  );
}

/* ── Task Modal ────────────────────────────────────────────────────── */
function TaskModal({ task, onClose, onSave, saving }) {
  const [form, setForm] = useState(task ? { ...task } : blankTask());
  const [error, setError] = useState("");

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const submit = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setError("");
    await onSave(form);
  };

  return createPortal(
    <div className="flow-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="flow-modal" style={{ maxWidth: 520 }}>
        <div className="flow-modal-header">
          <div className="flow-modal-header-info">
            <h3>{task?.id ? "Edit Task" : "New Task"}</h3>
            <p>Fill in the details below</p>
          </div>
          <button type="button" className="flow-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="flow-modal-body">
          {error && <div className="form-error-banner">{error}</div>}

          <div className="field-group">
            <span className="field-label">Title <span className="required-star">*</span></span>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Task title" />
          </div>

          <div className="field-group">
            <span className="field-label">Description</span>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="Details…" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field-group">
              <span className="field-label">Priority</span>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}>
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{PRIORITY_META[p].emoji} {PRIORITY_META[p].label}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <span className="field-label">Status</span>
              <select value={form.status} onChange={e => set("status", e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="field-group">
              <span className="field-label">Due Date</span>
              <input type="date" value={form.dueDate || ""} onChange={e => set("dueDate", e.target.value)} />
            </div>
            <div className="field-group">
              <span className="field-label">Assigned To</span>
              <input value={form.assignedTo || ""} onChange={e => set("assignedTo", e.target.value)} placeholder="Name or email" />
            </div>
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-neutral" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-gold" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : task?.id ? "Update Task" : "Create Task"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Main Tasks Page ────────────────────────────────────────────────── */
export default function Tasks() {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");
  const [toast, setToast]           = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Notify other components (sidebar badge, dashboard button) that tasks changed
  const dispatchTasksUpdated = () => {
    window.dispatchEvent(new Event("tasksUpdated"));
  };

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await platformApi.getTasks();
      setTasks(Array.isArray(data) ? data : []);
      // ADD:
      try {
        const orgId = getOrganizationId();
        if (orgId) localStorage.setItem(`lawoffice.tasks.${orgId}`, JSON.stringify(data));
      } catch {}
      window.dispatchEvent(new Event("tasksUpdated"));
    } catch (err) {
      setError(err.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (form.id) {
        const updated = await platformApi.updateTask(form.id, form);
        setTasks(prev => prev.map(t => t.id === form.id ? updated : t));
        showToast("Task updated.");
      } else {
        const created = await platformApi.createTask(form);
        setTasks(prev => [created, ...prev]);
        showToast("Task created!");
      }
      setShowModal(false);
      setEditingTask(null);
      dispatchTasksUpdated();
    } catch (err) {
      setError(err.message || "Failed to save task.");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickAdd = async (form) => {
    setSaving(true);
    try {
      const created = await platformApi.createTask(form);
      setTasks(prev => [created, ...prev]);
      showToast("Task added!");
      dispatchTasksUpdated();
    } catch (err) {
      setError(err.message || "Failed to add task.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    setSaving(true);
    try {
      await platformApi.deleteTask(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      showToast("Task deleted.");
      dispatchTasksUpdated();
    } catch (err) {
      setError(err.message || "Failed to delete task.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    setSaving(true);
    try {
      const updated = await platformApi.updateTask(task.id, { ...task, status: nextStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      showToast(nextStatus === "COMPLETED" ? "Marked complete! ✅" : "Marked pending.");
      dispatchTasksUpdated();
    } catch (err) {
      setError(err.message || "Failed to update task.");
    } finally {
      setSaving(false);
    }
  };

  const pendingCount    = tasks.filter(t => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completedCount  = tasks.filter(t => t.status === "COMPLETED").length;
  const overdueCount    = tasks.filter(t => (t.status === "PENDING" || t.status === "IN_PROGRESS") && isOverdue(t.dueDate)).length;

  const filteredTasks = tasks.filter(task => {
    if (filterStatus !== "ALL" && task.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && task.priority !== filterPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !String(task.title || "").toLowerCase().includes(q) &&
        !String(task.description || "").toLowerCase().includes(q) &&
        !String(task.assignedTo || "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Sort: pending + overdue first, then by priority, then by date
  const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.status === "COMPLETED" && b.status !== "COMPLETED") return 1;
    if (b.status === "COMPLETED" && a.status !== "COMPLETED") return -1;
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = a.dueDate ? new Date(a.dueDate) : new Date("9999-12-31");
    const db = b.dueDate ? new Date(b.dueDate) : new Date("9999-12-31");
    return da - db;
  });

  return (
    <AppShell
      title="Tasks"
      subtitle="Manage your team's action items, deadlines, and deliverables."
      actions={
        <button type="button" className="btn-gold" onClick={() => { setEditingTask(null); setShowModal(true); }}>
          + New Task
        </button>
      }
    >
      {/* ── KPI Strip ── */}
      <div className="tasks-kpi-strip">
        <div className="tasks-kpi-card tasks-kpi-pending">
          <span className="tasks-kpi-number">{pendingCount}</span>
          <span className="tasks-kpi-label">Pending</span>
        </div>
        <div className="tasks-kpi-card tasks-kpi-overdue">
          <span className="tasks-kpi-number">{overdueCount}</span>
          <span className="tasks-kpi-label">Overdue</span>
        </div>
        <div className="tasks-kpi-card tasks-kpi-done">
          <span className="tasks-kpi-number">{completedCount}</span>
          <span className="tasks-kpi-label">Completed</span>
        </div>
        <div className="tasks-kpi-card tasks-kpi-total">
          <span className="tasks-kpi-number">{tasks.length}</span>
          <span className="tasks-kpi-label">Total</span>
        </div>
      </div>

      {/* ── Quick Add ── */}
      <QuickAddBar onAdd={handleQuickAdd} saving={saving} />

      {/* ── Filters ── */}
      <div className="tasks-filter-bar">
        <input
          className="tasks-search-input"
          placeholder="🔍 Search tasks…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <div className="tasks-filter-pills">
          {["ALL", ...STATUS_OPTIONS].map(s => (
            <button
              key={s}
              type="button"
              className={`tasks-pill ${filterStatus === s ? "tasks-pill-active" : ""}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === "ALL" ? "All Status" : (STATUS_META[s]?.emoji + " " + STATUS_META[s]?.label)}
            </button>
          ))}
        </div>
        <div className="tasks-filter-pills">
          {["ALL", ...PRIORITY_OPTIONS].map(p => (
            <button
              key={p}
              type="button"
              className={`tasks-pill ${filterPriority === p ? "tasks-pill-active" : ""}`}
              onClick={() => setFilterPriority(p)}
            >
              {p === "ALL" ? "All Priority" : (PRIORITY_META[p]?.emoji + " " + PRIORITY_META[p]?.label)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && <div className="form-error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* ── Task List ── */}
      {loading ? (
        <div className="tasks-loading">
          <div className="loading-spinner" />
          <p>Loading tasks…</p>
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="tasks-empty">
          <div className="tasks-empty-icon">📋</div>
          <h3>No tasks found</h3>
          <p>{tasks.length === 0 ? "Add your first task using the form above." : "Try adjusting your filters."}</p>
        </div>
      ) : (
        <div className="tasks-list">
          {sortedTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={t => { setEditingTask(t); setShowModal(true); }}
              onDelete={handleDelete}
              onToggleStatus={handleToggleStatus}
            />
          ))}
        </div>
      )}

      {/* ── Results count ── */}
      {!loading && tasks.length > 0 && (
        <p className="tasks-result-count">
          Showing {sortedTasks.length} of {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <TaskModal
          task={editingTask}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {/* ── Toast ── */}
      {toast && <div className="success-toast">{toast}</div>}
    </AppShell>
  );
}
