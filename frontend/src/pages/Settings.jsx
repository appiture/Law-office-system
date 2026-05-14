import { useState, useEffect } from "react";
import AppShell from "../components/AppShell";
import { supabasePlatformApi } from "../repositories/supabaseRepository";
import { uploadAsset, buildTenantAssetPrefix } from "../services/storageService";
import { supabaseBuckets } from "../services/supabaseClient";
import { 
  getOrganizationName, 
  getOrganizationLogoUrl, 
  getOrganizationAddress,
  getOrganizationPhone,
  getOrganizationEmail,
  getOrganizationWebsite,
  getUserFullName, 
  getUserAvatarUrl,
  getUserEmail,
  syncSupabaseSession
} from "../services/authService";
import "./formStyles.css";

function Settings() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Org state
  const [orgName, setOrgName] = useState(getOrganizationName());
  const [orgLogoUrl, setOrgLogoUrl] = useState(getOrganizationLogoUrl());
  const [orgLogoPath, setOrgLogoPath] = useState("");
  const [orgAddress, setOrgAddress] = useState(getOrganizationAddress());
  const [orgPhone, setOrgPhone] = useState(getOrganizationPhone());
  const [orgEmail, setOrgEmail] = useState(getOrganizationEmail());
  const [orgWebsite, setOrgWebsite] = useState(getOrganizationWebsite());
  
  // User state
  const [fullName, setFullName] = useState(getUserFullName());
  const [avatarUrl, setAvatarUrl] = useState(getUserAvatarUrl());
  const [avatarPath, setAvatarPath] = useState("");


  useEffect(() => {
    const loadPaths = async () => {
      try {
        const context = await supabasePlatformApi.getWorkspaceContext();
        if (context?.organizationLogoPath) {
          setOrgLogoPath(context.organizationLogoPath);
        }
        if (context?.avatarPath) {
          setAvatarPath(context.avatarPath);
        }
      } catch (err) {
        console.warn("Could not load workspace paths", err);
      }
    };
    void loadPaths();
  }, []);

  const handleOrgLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError("");
      
      const prefix = buildTenantAssetPrefix({ scope: "branding" });
      const result = await uploadAsset({ 
        file, 
        bucket: supabaseBuckets.clients, // Using clients bucket for branding for now
        prefix 
      });
      
      setOrgLogoUrl(result.signedUrl || result.publicUrl);
      setOrgLogoPath(result.path);
    } catch (err) {
      setError(err.message || "Failed to upload logo.");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError("");
      
      const prefix = buildTenantAssetPrefix({ scope: "avatars" });
      const result = await uploadAsset({ 
        file, 
        bucket: supabaseBuckets.clients, 
        prefix 
      });
      
      setAvatarUrl(result.signedUrl || result.publicUrl);
      setAvatarPath(result.path);
    } catch (err) {
      setError(err.message || "Failed to upload avatar.");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await supabasePlatformApi.saveUserProfile({
        fullName,
        avatarUrl,
        avatarPath
      });
      await syncSupabaseSession(null, { force: true });
      setSuccess("Profile saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to save profile.");
    } finally {
      setLoading(false);
    }
  };

  const handleBrandingSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await supabasePlatformApi.saveOrganizationSettings({
        name: orgName,
        logoUrl: orgLogoUrl,
        logoPath: orgLogoPath,
        address: orgAddress,
        phone: orgPhone,
        email: orgEmail,
        website: orgWebsite
      });
      await syncSupabaseSession(null, { force: true });
      setSuccess("Organization branding saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to save organization settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell title="Settings" subtitle="Manage your organization and profile">
      <div className="flow-modal" style={{ margin: "0 auto", animation: "none", width: "100%", maxWidth: "800px" }}>
        <div className="flow-modal-body">
          {error && <div className="form-error-banner">{error}</div>}
          {success && <div className="success-toast">{success}</div>}

          <form onSubmit={handleProfileSave} className="form-section">
            <div className="form-section-title">
              <span>👤</span> My Profile
            </div>
            <div className="form-section-grid">
              <div className="field-group fcol-full">
                <p className="field-label">Profile Picture</p>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" style={{ width: "80px", height: "80px", borderRadius: "20px", objectFit: "cover" }} onError={() => setAvatarUrl(null)} />
                  ) : (
                    <div className="user-avatar-fallback" style={{ width: "80px", height: "80px", fontSize: "2rem", borderRadius: "20px" }}>
                      {getUserEmail().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <label className="btn-neutral" style={{ cursor: "pointer" }}>
                    Change Avatar
                    <input type="file" hidden accept="image/*" onChange={handleAvatarUpload} disabled={loading} />
                  </label>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Full Name</label>
                <input 
                  type="text" 
                  placeholder="Enter your name" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Email Address</label>
                <input type="email" value={getUserEmail()} disabled style={{ opacity: 0.6 }} />
                <p className="field-hint">Email cannot be changed.</p>
              </div>
            </div>
            
            <div className="flow-modal-footer" style={{ borderTop: "none", padding: "16px 0 0 0", marginTop: "16px" }}>
              <div></div>
              <button type="submit" className="btn-gold" disabled={loading}>
                {loading ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>

          <form onSubmit={handleBrandingSave} className="form-section" style={{ marginTop: "32px" }}>
            <div className="form-section-title">
              <span>🏢</span> Organization Branding
            </div>
            <div className="form-section-grid">
              <div className="field-group fcol-full">
                <p className="field-label">Organization Logo</p>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  {orgLogoUrl ? (
                    <div style={{ padding: "10px", background: "var(--color-bg)", borderRadius: "12px", border: "1px solid var(--color-border)" }}>
                      <img src={orgLogoUrl} alt="Logo" style={{ maxHeight: "60px", maxWidth: "200px", objectFit: "contain" }} onError={() => setOrgLogoUrl(null)} />
                    </div>
                  ) : (
                    <div className="brand-mark" style={{ width: "80px", height: "80px", borderRadius: "20px" }}>LO</div>
                  )}
                  <label className="btn-neutral" style={{ cursor: "pointer" }}>
                    Upload New Logo
                    <input type="file" hidden accept="image/*" onChange={handleOrgLogoUpload} disabled={loading} />
                  </label>
                </div>
              </div>

              <div className="field-group fcol-full">
                <label className="field-label">Organization Name</label>
                <input 
                  type="text" 
                  placeholder="Enter organization name" 
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>

              <div className="field-group fcol-full">
                <label className="field-label">Office Address</label>
                <textarea 
                  placeholder="Enter full office address for reports" 
                  value={orgAddress}
                  onChange={(e) => setOrgAddress(e.target.value)}
                  style={{ minHeight: "80px", resize: "vertical" }}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Contact Phone</label>
                <input 
                  type="text" 
                  placeholder="e.g. +91 98765 43210" 
                  value={orgPhone}
                  onChange={(e) => setOrgPhone(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Official Email</label>
                <input 
                  type="email" 
                  placeholder="e.g. contact@lawoffice.com" 
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                />
              </div>

              <div className="field-group fcol-full">
                <label className="field-label">Website URL</label>
                <input 
                  type="url" 
                  placeholder="e.g. https://www.lawoffice.com" 
                  value={orgWebsite}
                  onChange={(e) => setOrgWebsite(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flow-modal-footer" style={{ borderTop: "none", padding: "16px 0 0 0", marginTop: "16px" }}>
              <div></div>
              <button type="submit" className="btn-gold" disabled={loading}>
                {loading ? "Saving..." : "Save Branding"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}

export default Settings;




