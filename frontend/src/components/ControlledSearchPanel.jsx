import { useState } from "react";

const DEFAULT_LIMIT = 25;

function ControlledSearchPanel({
  title = "Find records",
  description,
  fields = [],
  values,
  onChange,
  onSearch,
  onShowAll,
  onClear,
  loading = false,
  pageSize = DEFAULT_LIMIT,
}) {
  const [localValues, setLocalValues] = useState(values || {});
  const currentValues = values || localValues;

  const updateField = (field, value) => {
    const next = { ...currentValues, [field]: value };
    if (values) {
      onChange?.(next);
    } else {
      setLocalValues(next);
      onChange?.(next);
    }
  };

  const clear = () => {
    const next = fields.reduce((acc, field) => ({ ...acc, [field.name]: field.defaultValue || "" }), {});
    if (values) {
      onChange?.(next);
    } else {
      setLocalValues(next);
      onChange?.(next);
    }
    onClear?.();
  };

  const submit = (event) => {
    event.preventDefault();
    onSearch?.(currentValues);
  };

  return (
    <section className="controlled-search-panel">
      <div className="controlled-search-copy">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>

      <form className="controlled-search-form" onSubmit={submit}>
        <div className="controlled-search-fields">
          {fields.map((field) => (
            <label key={field.name} className="controlled-search-field">
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={currentValues[field.name] || field.defaultValue || ""}
                  onChange={(event) => updateField(field.name, event.target.value)}
                >
                  {(field.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || "text"}
                  value={currentValues[field.name] || ""}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.placeholder}
                />
              )}
            </label>
          ))}
        </div>

        <div className="controlled-search-actions">
          <button type="submit" className="btn-gold" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
          <button type="button" className="btn-neutral" onClick={onShowAll} disabled={loading}>
            Show All
          </button>
          <button type="button" className="btn-neutral" onClick={clear} disabled={loading}>
            Clear
          </button>
          <span className="controlled-search-limit">Show All loads {pageSize} per page.</span>
        </div>
      </form>
    </section>
  );
}

export function LoadingState({ label = "Loading records..." }) {
  return <div className="module-state module-state-loading">{label}</div>;
}

export function EmptyState({ label = "No data found." }) {
  return <div className="empty-box" style={{ gridColumn: "1 / -1" }}>{label}</div>;
}

export function ErrorState({ message }) {
  if (!message) return null;
  return <div className="form-error-banner" style={{ marginBottom: 16 }}>{message}</div>;
}

export function PaginationControls({ page, total, pageSize = DEFAULT_LIMIT, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  return (
    <div className="pagination-controls">
      <button type="button" className="btn-neutral" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pageCount}
      </span>
      <button type="button" className="btn-neutral" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        Next
      </button>
    </div>
  );
}

export default ControlledSearchPanel;




