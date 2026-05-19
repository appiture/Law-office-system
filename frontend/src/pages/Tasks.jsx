import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getOrganizationId } from "../services/authService";
import HeaderFilters from "../components/HeaderFilters";
import { openExport } from "../store/exportStore";
import logger from "../services/loggerService";
import { TASK_STATUS } from "../constants/statuses";
import { formatDate } from "../utils/formatters";
import "./Tasks.css";

const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUS_OPTIONS   = [TASK_STATUS.PENDING, TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED];

const PRIORITY_META = {
  LOW:     { label: "Low",     emoji: "🟢", cls: "priority-low" },
  MEDIUM:  { label: "Medium",  emoji: "🟡", cls: "priority-medium" },
  HIGH:    { label: "High",    emoji: "🟠", cls: "priority-high" },
  URGENT:  { label: "Urgent",  emoji: "🔴", cls: "priority-urgent" },
};

const STATUS_META = {
  [TASK_STATUS.PENDING]:     { label: "Pending",     emoji: "⏳", cls: "status-pending" },
  [TASK_STATUS.IN_PROGRESS]: { label: "In Progress", emoji: "🔄", cls: "status-in-progress" },
  [TASK_STATUS.COMPLETED]:   { label: "Completed",   emoji: "✅", cls: "status-completed" },
  [TASK_STATUS.CANCELLED]:   { label: "Cancelled",   emoji: "❌", cls: "status-cancelled" },
};

const blankTask = () => ({
  title: "",
  description: "",
  priority: "MEDIUM",
  status: TASK_STATUS.PENDING,
  dueDate: "",
  assignedTo: "",
});

function formatDueDate(dateStr) {
  return formatDate(dateStr);
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

function buildSearchTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function matchesTokens(tokens, values) {
  if (!tokens.length) return true;
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return tokens.every(token => haystack.includes(token));
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
    onAdd({ title: trimmed, priority, dueDate, description: "", status: TASK_STATUS.PENDING, assignedTo: "" });
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
  const overdue = task.status === TASK_STATUS.PENDING && isOverdue(task.dueDate);
  const soon    = task.status === TASK_STATUS.PENDING && isDueSoon(task.dueDate);

  return (
    <div className={`task-card ${sm.cls} ${overdue ? "task-overdue" : soon ? "task-due-soon" : ""}`}>
      <div className="task-card-top">
        <button
          type="button"
          className={`task-check ${task.status === TASK_STATUS.COMPLETED ? "checked" : ""}`}
          onClick={() => onToggleStatus(task)}
          title={task.status === TASK_STATUS.COMPLETED ? "Mark as Pending" : "Mark as Complete"}
        >
          {task.status === TASK_STATUS.COMPLETED ? "✓" : ""}
        </button>

        <div className="task-card-body">
          <div className="task-card-title-row">
            <span className={`task-title ${task.status === TASK_STATUS.COMPLETED ? "task-done-strike" : ""}`}>
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
  const [searchParams] = useSearchParams();
  const focusTaskId = searchParams.get("focus");
  
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
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Notify other components (sidebar badge, dashboard button) that tasks changed
  const dispatchTasksUpdated = () => {
    window.dispatchEvent(new Event("tasksUpdated"));
  };

  const loadTasks = useCallback(async () => {
    const orgId = getOrganizationId();
    if (!orgId) return;
    setLoading(true);
    setError("");
    try {
      const data = await platformApi.getTasks();
      setTasks(data || []);
      dispatchTasksUpdated();
    } catch (err) {
      logger.error("Failed to load tasks", err);
      setError(err.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (focusTaskId && tasks.length > 0) {
      const task = tasks.find(t => String(t.id) === focusTaskId);
      if (task) {
        setEditingTask(task);
        setShowModal(true);
      }
    }
  }, [focusTaskId, tasks]);

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
      logger.error("Failed to save task", err);
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
      logger.error("Failed to add task", err);
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
      logger.error("Failed to delete task", err);
      setError(err.message || "Failed to delete task.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (task) => {
    const nextStatus = task.status === TASK_STATUS.COMPLETED ? TASK_STATUS.PENDING : TASK_STATUS.COMPLETED;
    setSaving(true);
    try {
      const updated = await platformApi.updateTask(task.id, { ...task, status: nextStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
      showToast(nextStatus === TASK_STATUS.COMPLETED ? "Marked complete! ✅" : "Marked pending.");
      dispatchTasksUpdated();
    } catch (err) {
      setError(err.message || "Failed to update task.");
    } finally {
      setSaving(false);
    }
  };

  const pendingCount    = tasks.filter(t => t && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.IN_PROGRESS)).length;
  const completedCount  = tasks.filter(t => t && t.status === TASK_STATUS.COMPLETED).length;
  const overdueCount    = tasks.filter(t => t && (t.status === TASK_STATUS.PENDING || t.status === TASK_STATUS.IN_PROGRESS) && isOverdue(t.dueDate)).length;

  const searchTokens = buildSearchTokens(searchQuery);
  const filteredTasks = tasks.filter(task => {
    if (filterStatus !== "ALL" && task.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && task.priority !== filterPriority) return false;
    if (!matchesTokens(searchTokens, [task.title, task.description, task.assignedTo, task.status, task.priority])) return false;
    if (filterFromDate || filterToDate) {
      if (!task.dueDate) return false;
      const d = new Date(task.dueDate);
      if (filterFromDate && d < new Date(filterFromDate)) return false;
      if (filterToDate && d > new Date(filterToDate)) return false;
    }
    return true;
  });

  const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (a.status === TASK_STATUS.COMPLETED && b.status !== TASK_STATUS.COMPLETED) return 1;
    if (b.status === TASK_STATUS.COMPLETED && a.status !== TASK_STATUS.COMPLETED) return -1;
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
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn-gold header-action-btn" onClick={() => openExport({
            type: "tasks",
            availableData: sortedTasks,
            currentFilters: { status: filterStatus, priority: filterPriority, searchTerm: searchQuery },
            defaultDateRange: { start: filterFromDate, end: filterToDate }
          })} style={{ background: "rgba(196, 154, 108, 0.1)", color: "var(--color-gold)", border: "1px solid var(--color-gold)" }}>
            📥 Export
          </button>
          <button type="button" className="btn-gold header-action-btn" onClick={() => { setEditingTask(null); setShowModal(true); }}>
            + New Task
          </button>
        </div>
      }
    >
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

      <QuickAddBar onAdd={handleQuickAdd} saving={saving} />

      <HeaderFilters
        searchTerm={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search tasks by any word..."
        filters={[
          {
            id: "status",
            label: "Status",
            options: STATUS_OPTIONS.map(s => ({ value: s, label: STATUS_META[s].label }))
          },
          {
            id: "priority",
            label: "Priority",
            options: PRIORITY_OPTIONS.map(p => ({ value: p, label: PRIORITY_META[p].label }))
          }
        ]}
        filterValues={{ status: filterStatus, priority: filterPriority }}
        onFilterChange={(id, val) => {
          if (id === "status") setFilterStatus(val || "ALL");
          if (id === "priority") setFilterPriority(val || "ALL");
        }}
        dateRangeConfig={{
          label: "Due Date",
          fromDate: filterFromDate,
          toDate: filterToDate,
          onFromDateChange: setFilterFromDate,
          onToDateChange: setFilterToDate
        }}
        onClearFilters={() => {
          setSearchQuery("");
          setFilterStatus("ALL");
          setFilterPriority("ALL");
          setFilterFromDate("");
          setFilterToDate("");
        }}
        onShowAll={() => {
          setSearchQuery("");
          setFilterStatus("ALL");
          setFilterPriority("ALL");
          setFilterFromDate("");
          setFilterToDate("");
        }}
      />

      {error && <div className="form-error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="premium-loader">Loading tasks…</div>
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

      {!loading && tasks.length > 0 && (
        <p className="tasks-result-count">
          Showing {sortedTasks.length} of {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </p>
      )}

      {showModal && (
        <TaskModal
          task={editingTask}
          onClose={() => { setShowModal(false); setEditingTask(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {toast && <div className="success-toast">{toast}</div>}
    </AppShell>
  );
}
