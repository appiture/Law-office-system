import React from "react";
import { LogOut, CreditCard, MessageSquare } from "lucide-react";
import { supabase } from "../services/supabaseClient";

const DemoExpiredScreen = ({ demoExpiresAt }) => {
  const expiryDate = demoExpiresAt ? new Date(demoExpiresAt).toLocaleDateString() : "recently";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CreditCard className="w-10 h-10 text-amber-500" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2">Demo Period Expired</h1>
        <p className="text-slate-400 mb-8">
          Your trial period ended on <span className="text-amber-500 font-semibold">{expiryDate}</span>. 
          To continue using the Law Office Management System, please upgrade to a full account.
        </p>

        <div className="space-y-4">
          <button 
            onClick={() => window.open("mailto:support@lawoffice.local", "_blank")}
            className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <CreditCard className="w-5 h-5" />
            Upgrade to Paid Version
          </button>
          
          <button 
            onClick={() => window.open("https://lawoffice.local/contact", "_blank")}
            className="w-full py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-5 h-5" />
            Contact Support
          </button>

          <button 
            onClick={handleLogout}
            className="w-full py-3 px-4 bg-transparent hover:bg-slate-700/50 text-slate-400 hover:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 mt-4"
          >
            <LogOut className="w-5 h-5" />
            Logout and Exit
          </button>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          All your data is safe and will be available immediately after upgrading.
        </p>
      </div>
    </div>
  );
};

export default DemoExpiredScreen;
