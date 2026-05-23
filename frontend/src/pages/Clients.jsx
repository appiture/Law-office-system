import { useState, useEffect, useCallback } from "react"; // Refreshed to resolve dev server glitch
import { createPortal } from "react-dom";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import ProfileCard from "../components/ui/ProfileCard/ProfileCard";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import HeaderFilters from "../components/HeaderFilters";
import ControlledSearchPanel, { EmptyState, ErrorState, LoadingState, PaginationControls } from "../components/ControlledSearchPanel";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { openExport } from "../store/exportStore";
import logger from "../services/loggerService";
import "./Clients.css";
import "./formStyles.css";

const PAGE_SIZE = 25;
const emptyFilters = { searchTerm: "", phone: "", email: "", fromDate: "", toDate: "" };

function Clients() {
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialSearchName = searchParams.get("search");
  const [initialSearchTriggered, setInitialSearchTriggered] = useState(false);

  const savedStateStr = sessionStorage.getItem("clients_page_state");
  const savedState = savedStateStr ? JSON.parse(savedStateStr) : null;

  const [filters, setFilters] = useState(() => savedState?.filters || { ...emptyFilters, searchTerm: initialSearchName || "" });
  const [hasLoaded, setHasLoaded] = useState(() => savedState?.hasLoaded || Boolean(initialSearchName));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(() => savedState?.page || 1);
  const [total, setTotal] = useState(0);
  const [showAllMode, setShowAllMode] = useState(() => savedState?.showAllMode || false);
  const [deletingClientId, setDeletingClientId] = useState(null);

  useEffect(() => {
    sessionStorage.setItem("clients_page_state", JSON.stringify({
      filters, hasLoaded, page, showAllMode
    }));
  }, [filters, hasLoaded, page, showAllMode]);

  const loadClients = useCallback(async ({ nextPage = page, showAll = showAllMode, nextFilters = filters } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await platformApi.searchClients({
        filters: nextFilters,
        showAll,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setClients(Array.isArray(response.items) ? response.items : []);
      setTotal(Number(response.total || 0));
      setPage(Number(response.page || nextPage));
      setHasLoaded(true);
      setShowAllMode(showAll);
    } catch (err) {
      logger.error("Failed to load clients", err);
      setError(err.message || "Failed to load clients.");
      setClients([]);
      setTotal(0);
      setHasLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, showAllMode]);

  const openCreate = useCallback(() => {
    setActiveClient(null);
    setShowWizard(true);
  }, []);

  const openEdit = useCallback((client) => {
    if (client?.id) {
      setActiveClient(client);
      setShowWizard(true);
    } else {
      openCreate();
    }
  }, [openCreate]);

  const saveClient = async (payload) => {
    await platformApi.saveWizardStep(payload, activeClient?.id || payload.client?.id || null);
    if (hasLoaded) await loadClients();
  };

  const deleteClientPermanently = async (client) => {
    const approved = window.confirm(
      `Permanently delete ${client.name}? This removes the client and linked cases, payments, documents, and hearings from the database. This cannot be undone.`
    );
    if (!approved) return;

    setDeletingClientId(client.id);
    setError("");
    try {
      await platformApi.deleteClient(client.id);
      const remainingOnPage = clients.length - 1;
      const nextPage = remainingOnPage <= 0 && page > 1 ? page - 1 : page;
      await loadClients({ nextPage });
    } catch (err) {
      logger.error("Failed to delete client", err);
      setError(err.message || "Failed to delete client.");
    } finally {
      setDeletingClientId(null);
    }
  };

  const handleSearch = useCallback((nextFilters = filters) => {
    setShowAllMode(false);
    void loadClients({ nextPage: 1, showAll: false, nextFilters });
  }, [filters, loadClients]);

  const handleShowAll = () => {
    setShowAllMode(true);
    void loadClients({ nextPage: 1, showAll: true });
  };

  const handlePageChange = (nextPage) => {
    void loadClients({ nextPage });
  };

  const initialEditId = searchParams.get("editId");
  const [initialEditTriggered, setInitialEditTriggered] = useState(false);

  // Mount and filter change effect
  useEffect(() => {
    if (!hasLoaded) {
      if (initialSearchName && !initialSearchTriggered) {
        setInitialSearchTriggered(true);
        void loadClients({ nextPage: 1, showAll: false, nextFilters: { ...emptyFilters, searchTerm: initialSearchName } });
      }
    } else {
      // Restore from saved state
      void loadClients({ nextPage: page, showAll: showAllMode, nextFilters: filters });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    const hasActiveFilters = Object.values(filters).some(Boolean);
    if (hasActiveFilters) {
      handleSearch(filters);
    } else if (hasLoaded && !showAllMode) {
      setClients([]);
      setTotal(0);
      setHasLoaded(false);
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.searchTerm, filters.phone, filters.email, filters.fromDate, filters.toDate, hasLoaded, showAllMode]);

  useEffect(() => {
    if (initialEditId && !initialEditTriggered && clients.length > 0) {
      const clientToEdit = clients.find(c => String(c.id) === String(initialEditId));
      if (clientToEdit) {
        setInitialEditTriggered(true);
        openEdit(clientToEdit);
      }
    }
  }, [initialEditId, initialEditTriggered, clients, openEdit]);

  return (
    <AppShell
      title="Client Details"
      subtitle="Search clients by name, phone, email, city, notes, or ID proof."
      actions={
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="btn-gold header-action-btn" onClick={() => openExport({
            type: "clients",
            availableData: clients,
            currentFilters: filters,
            defaultDateRange: { start: filters.fromDate, end: filters.toDate }
          })}>
            📥 Export
          </button>
          <button type="button" className="primary-button header-action-btn" onClick={openCreate}>
            + Add Client
          </button>
        </div>
      }
    >
      <ErrorState message={error} />
      <HeaderFilters
        searchTerm={filters.searchTerm}
        onSearchChange={(val) => setFilters(p => ({ ...p, searchTerm: val }))}
        searchPlaceholder="Search clients by any word..."
        filters={[
          { id: "phone", label: "Phone", type: "text", placeholder: "Phone number" },
          { id: "email", label: "Email", type: "text", inputType: "email", placeholder: "Email address" }
        ]}
        filterValues={{ phone: filters.phone, email: filters.email }}
        onFilterChange={(id, val) => setFilters(p => ({ ...p, [id]: val }))}
        dateRangeConfig={{
          label: "Registration Date",
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          onFromDateChange: (val) => setFilters(p => ({ ...p, fromDate: val })),
          onToDateChange: (val) => setFilters(p => ({ ...p, toDate: val }))
        }}
        onClearFilters={() => {
          setFilters(emptyFilters);
          setClients([]);
          setTotal(0);
          setHasLoaded(false);
          setShowAllMode(false);
          setError("");
        }}
        onShowAll={handleShowAll}
      />

      {hasLoaded && !loading && (
        <div className="search-results-count">
          {total} client{total !== 1 ? "s" : ""} found
        </div>
      )}

      <section className="card-grid">
        {!hasLoaded && <EmptyState label="Use the filters above to load clients." />}
        {loading && <LoadingState label="Loading clients..." />}
        {hasLoaded && !loading && clients.map((client) => {
          const photoUrl = getPersistentAssetUrl(client.photoUrl, "https://placehold.co/120x120/png?text=Client");
          return (
            <div key={client.id} className="premium-client-card-wrapper" style={{ position: 'relative', width: '100%', maxWidth: '320px', margin: '0 auto' }}>
              <div className="premium-card-quick-actions" style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                zIndex: 10,
                display: 'flex',
                gap: '8px'
              }}>
                <button 
                  type="button" 
                  className="btn-glass-action" 
                  style={{ padding: '6px 10px', fontSize: '12px', minHeight: '30px', width: '32px' }}
                  onClick={() => openEdit(client)}
                  title="Edit Client"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="action-btn-danger-glass"
                  style={{ padding: '6px 10px', fontSize: '12px', minHeight: '30px', width: '32px' }}
                  onClick={() => void deleteClientPermanently(client)}
                  disabled={deletingClientId === client.id}
                  title="Delete Client"
                >
                  🗑️
                </button>
              </div>

              <ProfileCard
                name={client.name}
                title={client.occupation || "Client"}
                avatarUrl={photoUrl}
                email={client.email}
                phone={client.phone}
                contactText="View Profile"
                behindGlowEnabled={false}
                behindGlowColor="var(--color-primary)"
                showUserInfo={true}
                enableTilt={false}
                onContactClick={() => navigate(`/clients/${client.id}`)}
              />
            </div>
          );
        })}
        {hasLoaded && !loading && clients.length === 0 && <EmptyState label="No clients found matching your search." />}
      </section>

      <PaginationControls page={page} total={total} pageSize={PAGE_SIZE} onPageChange={handlePageChange} />

      {showWizard ? createPortal(
        <MultiStepClientWizard
          client={activeClient}
          onClose={() => setShowWizard(false)}
          onSave={saveClient}
        />, document.body
      ) : null}

      {previewImage && (
        <div className="image-preview-overlay" onClick={() => setPreviewImage(null)}>
          <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
            <button className="image-preview-close" onClick={() => setPreviewImage(null)}>✕ Close</button>
            <img src={previewImage.src} alt={previewImage.alt} className="image-preview-large" />
          </div>
        </div>
      )}


    </AppShell>
  );
}

export default Clients;




