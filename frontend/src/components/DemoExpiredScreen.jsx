import React from "react";
import { LogOut, CreditCard, MessageSquare } from "lucide-react";
import { supabase } from "../services/supabaseClient";
import { ROUTES } from "../constants/routes";
import { formatDate } from "../utils/formatters";

const DemoExpiredScreen = ({ demoExpiresAt }) => {
  const expiryDate = demoExpiresAt ? formatDate(demoExpiresAt) : "recently";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = ROUTES.LOGIN;
  };

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "var(--color-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem"
    }}>
      <div style={{
        maxWidth: 400,
        width: "100%",
        backgroundColor: "var(--color-card)",
        borderRadius: 16,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        border: "1px solid var(--color-border)",
        padding: "2rem",
        textAlign: "center"
      }}>
        <div style={{
          width: 80,
          height: 80,
          backgroundColor: "rgba(201, 163, 78, 0.1)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.5rem"
        }}>
          <CreditCard size={40} color="var(--color-gold)" />
        </div>
        
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)", marginBottom: "0.5rem" }}>
          Demo Period Expired
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginBottom: "2rem", lineHeight: 1.5 }}>
          Your trial period ended on <span style={{ color: "var(--color-gold)", fontWeight: 600 }}>{expiryDate}</span>. 
          To continue using the Law Office Management System, please upgrade to a full account.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <button 
            onClick={() => window.open("mailto:support@lawoffice.local", "_blank")}
            className="btn-gold"
            style={{ width: "100%", justifyContent: "center" }}
          >
            <CreditCard size={20} />
            Upgrade to Paid Version
          </button>
          
          <button 
            onClick={() => window.open("https://lawoffice.local/contact", "_blank")}
            className="btn-glass"
            style={{ width: "100%", justifyContent: "center" }}
          >
            <MessageSquare size={20} />
            Contact Support
          </button>

          <button 
            onClick={handleLogout}
            className="ghost-button"
            style={{ width: "100%", justifyContent: "center", marginTop: "1rem" }}
          >
            <LogOut size={20} />
            Logout and Exit
          </button>
        </div>

        <p style={{ marginTop: "2rem", fontSize: 12, color: "var(--color-text-tertiary)" }}>
          All your data is safe and will be available immediately after upgrading.
        </p>
      </div>
    </div>
  );
};

export default DemoExpiredScreen;
