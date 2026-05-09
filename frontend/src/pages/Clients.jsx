import { useState, useEffect, useCallback } from "react"; // Refreshed to resolve dev server glitch
import { createPortal } from "react-dom";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import ProfileCard from "../components/ui/ProfileCard/ProfileCard";
import MultiStepClientWizard from "../components/MultiStepClientWizard";
import ControlledSearchPanel, { EmptyState, ErrorState, LoadingState, PaginationControls } from "../components/ControlledSearchPanel";
import { supabasePlatformApi as platformApi } from "../repositories/supabaseRepository";
import { getPersistentAssetUrl } from "../services/storageService";
import { ParticleCard } from "../components/ui/MagicBento/MagicBento";
import "./Clients.css";
import "./formStyles.css";

const PAGE_SIZE = 25;
const emptyFilters = { name: "", phone: "", email: "" };

function Clients() {
  const [clients, setClients] = useState([]);
  const [activeClient, setActiveClient] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialSearchName = searchParams.get("searchName") || "";
  
  const [filters, setFilters] = useState({ ...emptyFilters, name: initialSearchName });
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAllMode, setShowAllMode] = useState(false);
  const [initialSearchTriggered, setInitialSearchTriggered] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState(null);

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
      console.error("Failed to load clients:", err);
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
      navigate(`/clients/${client.id}?edit=true&step=0`);
    } else {
      openCreate();
    }
  }, [navigate, openCreate]);

  const saveClient = async (payload) => {
    await platformApi.saveWizardStep(payload, activeClient?.id || payload.client?.id || null);
    if (hasLoaded) await loadClients();
  };

  const deleteClientPermanently = async (client) => {
    const approved = window.confirm(
      `Permanently delete ${client.name}? This removes the client and linked cases, payments, documents, and follow-ups from the database. This cannot be undone.`
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
      console.error("Failed to delete client:", err);
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

  useEffect(() => {
    if (initialSearchName && !initialSearchTriggered) {
      setInitialSearchTriggered(true);
      handleSearch({ ...emptyFilters, name: initialSearchName });
    }
  }, [initialSearchName, initialSearchTriggered, handleSearch]);

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
      subtitle="Search first, then load matching client profiles."
      actions={
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="primary-button" onClick={openCreate}>
            + Add Client
          </button>
        </div>
      }
    >
      <ErrorState message={error} />
      <ControlledSearchPanel
        title="Search clients"
        description="Search by name, phone number, or email. Use Show All only when you need a full paged list."
        fields={[
          { name: "name", label: "Name", placeholder: "Client name" },
          { name: "phone", label: "Phone number", placeholder: "10 digit phone" },
          { name: "email", label: "Email", placeholder: "client@example.com" },
        ]}
        values={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onShowAll={handleShowAll}
        onClear={() => {
          setFilters(emptyFilters);
          setClients([]);
          setTotal(0);
          setHasLoaded(false);
          setError("");
        }}
        actions={
          <button type="button" className="btn-primary" onClick={openCreate}>
            + ADD NEW CLIENT
          </button>
        }
        loading={loading}
        totalResults={total}
        pageSize={PAGE_SIZE}
      />

      {hasLoaded && !loading && (
        <div className="search-results-count">
          {total} client{total !== 1 ? "s" : ""} found
        </div>
      )}

      <section className="clients-grid premium-grid">
        {!hasLoaded && <EmptyState label="Use the filters above to load clients." />}
        {loading && <LoadingState label="Loading clients..." />}
        {hasLoaded && !loading && clients.map((client) => {
          const photoUrl = getPersistentAssetUrl(client.photoUrl, "https://placehold.co/120x120/png?text=Client");
          return (
            <div key={client.id} className="premium-client-card-wrapper">
              <ParticleCard 
                className="magic-bento-card magic-bento-card--border-glow client-card-item"
                enableTilt={false}
                enableMagnetism={false}
                glowColor="201, 163, 78"
                particleCount={0}
              >
                <div className="premium-client-card-inner">
                  <ProfileCard
                    name={client.name}
                    title={client.occupation || "Client"}
                    avatarUrl={photoUrl}
                    email={client.email}
                    phone={client.phone}
                    behindGlowEnabled={true}
                    behindGlowColor="var(--color-secondary)"
                    showUserInfo={false}
                    enableTilt={false}
                  />

                  <div className="client-contact-display">
                    {client.phone && (
                      <a 
                        href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="contact-display-link"
                      >
                        <span className="contact-icon">💬</span>
                        <span className="contact-text">{client.phone}</span>
                      </a>
                    )}
                    {client.email && (
                      <a 
                        href={`mailto:${client.email}`}
                        className="contact-display-link"
                      >
                        <span className="contact-icon">📧</span>
                        <span className="contact-text">{client.email}</span>
                      </a>
                    )}
                  </div>
                  
                  <div className="premium-card-actions">
                    <div className="action-row">
                      <button 
                        type="button" 
                        className="btn-gold-action" 
                        onClick={() => navigate(`/clients/${client.id}`)}
                      >
                        👤 View Profile
                      </button>
                      <button 
                        type="button" 
                        className="btn-glass-action" 
                        onClick={() => navigate(`/clients/${client.id}?edit=true&step=0`)}
                        title="Edit Client"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="action-btn-danger-glass"
                        style={{ width: '48px', padding: '12px' }}
                        onClick={() => void deleteClientPermanently(client)}
                        disabled={deletingClientId === client.id}
                        title="Delete Client"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              </ParticleCard>
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




