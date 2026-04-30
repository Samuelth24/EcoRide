import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── CONFIG — Remplace par tes vraies valeurs ───────────────
const SUPABASE_URL = "https://ogpimhgsvagewclivaug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncGltaGdzdmFnZXdjbGl2YXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjE1MjQsImV4cCI6MjA5MjMzNzUyNH0.3r5oHkt8mQSIbnAyOxpCpn1VTSvkjdLZgk3DmIDAsqQ";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
// ──────────────────────────────────────────────────────────

const formatPrice = (p) => Number(p || 0).toLocaleString("fr-FR") + " FCFA";

const STATUS_META = {
  en_attente: { label: "En attente", color: "#FF6F00" },
  confirmé: { label: "Confirmé", color: "#00C853" },
  livré: { label: "Livré", color: "#2979FF" },
  annulé: { label: "Annulé", color: "#ef4444" },
};

const ROLE_META = {
  admin: { label: "Admin", icon: "👑", color: "#FFD600" },
  vendeur: { label: "Vendeur", icon: "🧑‍💼", color: "#FF6B35" },
  livreur: { label: "Livreur", icon: "🚚", color: "#2979FF" },
};

// ─────────────────────── APP ───────────────────────────────
export default function AdminApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  // Data
  const [vehicles, setVehicles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [team, setTeam] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);

  // Filters
  const [orderSearch, setOrderSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("tous");

  // Forms
  const [vehicleForm, setVehicleForm] = useState(null);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── AUTH ────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setAuthLoading(false);
    });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      setProfile(data);
    } catch (e) {
      showToast("Erreur chargement profil", "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const login = async () => {
    setLoginLoading(true); setLoginError("");
    try {
      const { error } = await sb.auth.signInWithPassword({ email: loginData.email, password: loginData.password });
      if (error) throw error;
    } catch (e) {
      setLoginError(e.message === "Invalid login credentials" ? "Email ou mot de passe incorrect." : e.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => { await sb.auth.signOut(); };

  const can = (action) => {
    if (!profile) return false;
    const perms = {
      admin: ["all"],
      vendeur: ["orders", "quotes", "vehicles_read", "dashboard"],
      livreur: ["delivery", "dashboard"],
    };
    return perms[profile.role]?.includes("all") || perms[profile.role]?.some(p => p.startsWith(action));
  };

  // ── DATA LOADERS ────────────────────────────────────────
  const loadVehicles = useCallback(async () => {
    const { data } = await sb.from("vehicles").select("*").order("created_at", { ascending: false });
    if (data) setVehicles(data);
  }, []);

  const loadOrders = useCallback(async () => {
    const { data } = await sb.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data);
  }, []);

  const loadQuotes = useCallback(async () => {
    const { data } = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (data) setQuotes(data);
  }, []);

  const loadTeam = useCallback(async () => {
    const { data } = await sb.from("profiles").select("*").order("created_at");
    if (data) setTeam(data);
  }, []);

  const loadStats = useCallback(async () => {
    const [o, v, q] = await Promise.all([
      sb.from("orders").select("amount,status"),
      sb.from("vehicles").select("stock,sales_count,status"),
      sb.from("quotes").select("status"),
    ]);
    const ord = o.data || []; const veh = v.data || []; const quo = q.data || [];
    setStats({
      revenue: ord.filter(x => x.status !== "annulé").reduce((s, x) => s + x.amount, 0),
      confirmed: ord.filter(x => x.status === "confirmé").length,
      pending: ord.filter(x => x.status === "en_attente").length,
      delivered: ord.filter(x => x.status === "livré").length,
      cancelled: ord.filter(x => x.status === "annulé").length,
      total: ord.length,
      stock: veh.reduce((s, x) => s + (x.stock || 0), 0),
      activeVehicles: veh.filter(x => x.status === "actif").length,
      newQuotes: quo.filter(x => x.status === "nouveau").length,
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    Promise.all([loadVehicles(), loadOrders(), loadQuotes(), loadTeam(), loadStats()])
      .finally(() => setLoading(false));
  }, [profile]);

  // ── REALTIME ────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    const ch1 = sb.channel("rt-orders").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { loadOrders(); loadStats(); }).subscribe();
    const ch2 = sb.channel("rt-quotes").on("postgres_changes", { event: "INSERT", schema: "public", table: "quotes" }, () => { loadQuotes(); loadStats(); showToast("📋 Nouveau devis reçu !"); }).subscribe();
    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); };
  }, [profile]);

  // ── ACTIONS ─────────────────────────────────────────────
  const updateOrderStatus = async (id, status) => {
    const { error } = await sb.from("orders").update({ status }).eq("id", id);
    if (error) { showToast("Erreur", "error"); return; }
    loadOrders(); loadStats();
    showToast(`Commande → ${STATUS_META[status].label}`);
    setModal(null);
  };

  const saveVehicle = async () => {
    if (!vehicleForm?.name || !vehicleForm?.price) { showToast("Nom et prix requis", "error"); return; }
    setVehicleLoading(true);
    try {
      const payload = { ...vehicleForm };
      delete payload._new;
      if (payload._new_id) delete payload.id;
      const { error } = vehicleForm._new
        ? await sb.from("vehicles").insert({ ...payload, id: undefined })
        : await sb.from("vehicles").update(payload).eq("id", payload.id);
      if (error) throw error;
      showToast(vehicleForm._new ? "Véhicule ajouté ✓" : "Véhicule mis à jour ✓");
      loadVehicles(); setModal(null); setVehicleForm(null);
    } catch (e) {
      showToast("Erreur : " + e.message, "error");
    } finally { setVehicleLoading(false); }
  };

  const deleteVehicle = async (id) => {
    const { error } = await sb.from("vehicles").delete().eq("id", id);
    if (error) { showToast("Erreur suppression", "error"); return; }
    showToast("Véhicule supprimé", "warn");
    loadVehicles(); setModal(null);
  };

  const updateQuoteStatus = async (id, status) => {
    await sb.from("quotes").update({ status }).eq("id", id);
    loadQuotes(); showToast("Devis mis à jour"); setModal(null);
  };

  // ── FILTERED ORDERS ──────────────────────────────────────
  const filteredOrders = orders.filter(o => {
    if (orderFilter !== "tous" && o.status !== orderFilter) return false;
    if (orderSearch && !o.client_name.toLowerCase().includes(orderSearch.toLowerCase()) && !o.id.toLowerCase().includes(orderSearch.toLowerCase())) return false;
    return true;
  });

  const MENU = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "orders", label: "Commandes", icon: "📦", badge: stats.pending, roles: ["admin", "vendeur"] },
    { id: "delivery", label: "Livraisons", icon: "🚚", roles: ["admin", "livreur"] },
    { id: "quotes", label: "Devis", icon: "📋", badge: stats.newQuotes, roles: ["admin", "vendeur"] },
    { id: "vehicles", label: "Véhicules", icon: "🚗", roles: ["admin", "vendeur"] },
    { id: "team", label: "Équipe", icon: "👥", roles: ["admin"] },
    { id: "settings", label: "Paramètres", icon: "⚙️", roles: ["admin"] },
  ].filter(m => !m.roles || (profile && m.roles.includes(profile.role)));

  // ── LOGIN SCREEN ─────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ width: 40, height: 40, border: "3px solid #1a1a1a", borderTop: "3px solid #FFD600", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  if (!session || !profile) return (
    <div style={A.loginBg}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        input:focus{border-color:#FFD600!important;outline:none}
      `}</style>
      <div style={A.loginCard}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>⚡</div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 900, color: "#FFD600", letterSpacing: -1 }}>EcoRide Admin</h1>
          <p style={{ color: "#444", fontSize: 13, marginTop: 4 }}>Espace de gestion interne</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={A.fl}>Email</label><input style={A.fi} placeholder="admin@ecoride.africa" value={loginData.email} onChange={e => setLoginData({ ...loginData, email: e.target.value })} onKeyDown={e => e.key === "Enter" && login()} /></div>
          <div><label style={A.fl}>Mot de passe</label><input style={A.fi} type="password" placeholder="••••••••" value={loginData.password} onChange={e => setLoginData({ ...loginData, password: e.target.value })} onKeyDown={e => e.key === "Enter" && login()} /></div>
          {loginError && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center" }}>{loginError}</p>}
          <button onClick={login} style={{ ...A.btnPrimary, width: "100%", padding: "13px", marginTop: 6, opacity: loginLoading ? .7 : 1 }} disabled={loginLoading}>
            {loginLoading ? "⏳ Connexion..." : "Connexion →"}
          </button>
        </div>
        <div style={{ marginTop: 24, borderTop: "1px solid #1a1a1a", paddingTop: 18, fontSize: 12, color: "#333", textAlign: "center" }}>
          Connexion sécurisée via Supabase Auth
        </div>
      </div>
    </div>
  );

  // ── MAIN LAYOUT ──────────────────────────────────────────
  return (
    <div style={A.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0a0a0a}::-webkit-scrollbar-thumb{background:#1e1e1e}
        input:focus,select:focus,textarea:focus{border-color:#FFD600!important;outline:none}
        tbody tr:hover td{background:#141414!important}
      `}</style>

      {/* TOAST */}
      {toast && <div style={{ ...A.toast, background: toast.type === "success" ? "#00C853" : toast.type === "warn" ? "#FF6F00" : "#ef4444", animation: "slideIn .3s ease" }}>{toast.msg}</div>}

      {/* MODAL */}
      {modal && (
        <div style={A.overlay} onClick={() => setModal(null)}>
          <div style={A.modalBox} onClick={e => e.stopPropagation()}>

            {/* VEHICLE FORM */}
            {(modal.type === "editVehicle" || modal.type === "addVehicle") && vehicleForm && (
              <div>
                <h3 style={A.modalTitle}>{modal.type === "addVehicle" ? "➕ Nouveau véhicule" : "✏️ Modifier le véhicule"}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                    <div><label style={A.fl}>Nom *</label><input style={A.fi} value={vehicleForm.name || ""} onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })} /></div>
                    <div><label style={A.fl}>Prix (FCFA) *</label><input style={A.fi} type="number" value={vehicleForm.price || ""} onChange={e => setVehicleForm({ ...vehicleForm, price: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                    <div><label style={A.fl}>Ancien prix</label><input style={A.fi} type="number" placeholder="0 = aucun" value={vehicleForm.old_price || ""} onChange={e => setVehicleForm({ ...vehicleForm, old_price: parseInt(e.target.value) || null })} /></div>
                    <div><label style={A.fl}>Stock</label><input style={A.fi} type="number" value={vehicleForm.stock || 0} onChange={e => setVehicleForm({ ...vehicleForm, stock: parseInt(e.target.value) || 0 })} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                    <div><label style={A.fl}>Autonomie (km)</label><input style={A.fi} type="number" value={vehicleForm.range_km || ""} onChange={e => setVehicleForm({ ...vehicleForm, range_km: parseInt(e.target.value) || 0 })} /></div>
                    <div><label style={A.fl}>Places</label><input style={A.fi} type="number" min={1} max={9} value={vehicleForm.seats || 4} onChange={e => setVehicleForm({ ...vehicleForm, seats: parseInt(e.target.value) || 4 })} /></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                    <div><label style={A.fl}>Catégorie</label>
                      <select style={A.fi} value={vehicleForm.category || "citadine"} onChange={e => setVehicleForm({ ...vehicleForm, category: e.target.value })}>
                        {["citadine", "premium", "utilitaire", "familiale", "professionnel"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label style={A.fl}>Statut</label>
                      <select style={A.fi} value={vehicleForm.status || "actif"} onChange={e => setVehicleForm({ ...vehicleForm, status: e.target.value })}>
                        <option value="actif">Actif</option><option value="inactif">Inactif</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                    <div><label style={A.fl}>Badge</label><input style={A.fi} placeholder="Ex: Bestseller" value={vehicleForm.badge || ""} onChange={e => setVehicleForm({ ...vehicleForm, badge: e.target.value })} /></div>
                    <div><label style={A.fl}>Icône (emoji)</label><input style={A.fi} placeholder="🚗" value={vehicleForm.icon || "🚗"} onChange={e => setVehicleForm({ ...vehicleForm, icon: e.target.value })} /></div>
                  </div>
                  <div><label style={A.fl}>Description</label><textarea style={{ ...A.fi, height: 80, resize: "vertical" }} value={vehicleForm.description || ""} onChange={e => setVehicleForm({ ...vehicleForm, description: e.target.value })} /></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="checkbox" id="ac-check" checked={vehicleForm.ac || false} onChange={e => setVehicleForm({ ...vehicleForm, ac: e.target.checked })} />
                    <label htmlFor="ac-check" style={{ color: "#ccc", fontSize: 13 }}>Climatisation incluse</label>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                    <button style={{ ...A.btnGhost, flex: 1 }} onClick={() => setModal(null)}>Annuler</button>
                    <button style={{ ...A.btnPrimary, flex: 1, opacity: vehicleLoading ? .7 : 1 }} onClick={saveVehicle} disabled={vehicleLoading}>
                      {vehicleLoading ? "⏳ Enregistrement..." : "✓ Enregistrer"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ORDER DETAIL */}
            {modal.type === "orderDetail" && (
              <div>
                <h3 style={A.modalTitle}>Commande {modal.data.id}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                  {[["Client", modal.data.client_name], ["Téléphone", modal.data.client_phone], ["Email", modal.data.client_email || "—"], ["Ville", modal.data.city], ["Adresse", modal.data.address || "—"], ["Véhicule", modal.data.vehicle_name], ["Montant", formatPrice(modal.data.amount)], ["Paiement", modal.data.payment?.toUpperCase()], ["Mensualités", modal.data.installments === 1 ? "Comptant" : modal.data.installments + " mois"], ["Date", new Date(modal.data.created_at).toLocaleDateString("fr-FR")]].map(([k, v]) => (
                    <div key={k} style={{ background: "#1a1a1a", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ color: "#555", fontSize: 10, marginBottom: 3 }}>{k.toUpperCase()}</div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {can("orders") && (
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ ...A.fl, marginBottom: 8, display: "block" }}>Changer le statut :</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Object.entries(STATUS_META).map(([k, m]) => (
                        <button key={k} onClick={() => updateOrderStatus(modal.data.id, k)}
                          style={{ background: modal.data.status === k ? m.color + "33" : "#1a1a1a", border: `1px solid ${modal.data.status === k ? m.color : "#2a2a2a"}`, color: modal.data.status === k ? m.color : "#777", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button style={{ ...A.btnGhost, width: "100%" }} onClick={() => setModal(null)}>Fermer</button>
              </div>
            )}

            {/* QUOTE DETAIL */}
            {modal.type === "quoteDetail" && (
              <div>
                <h3 style={A.modalTitle}>Devis {modal.data.id}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
                  {[["Client", modal.data.client_name], ["Téléphone", modal.data.client_phone], ["Email", modal.data.client_email || "—"], ["Véhicule", modal.data.vehicle_name || "Non précisé"], ["Date", new Date(modal.data.created_at).toLocaleDateString("fr-FR")]].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", background: "#1a1a1a", borderRadius: 8, padding: "10px 12px" }}>
                      <span style={{ color: "#555", fontSize: 12 }}>{k}</span><span style={{ fontWeight: 700, fontSize: 13 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 14 }}>
                    <div style={{ color: "#555", fontSize: 10, marginBottom: 6 }}>MESSAGE</div>
                    <p style={{ color: "#bbb", fontSize: 13, lineHeight: 1.6 }}>{modal.data.message}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={{ ...A.btnGhost, flex: 1 }} onClick={() => setModal(null)}>Fermer</button>
                  <button style={{ ...A.btnPrimary, flex: 1 }} onClick={() => updateQuoteStatus(modal.data.id, "traité")}>✓ Marquer traité</button>
                </div>
              </div>
            )}

            {/* CONFIRM DELETE */}
            {modal.type === "confirmDelete" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
                <h3 style={{ ...A.modalTitle, textAlign: "center" }}>Confirmer la suppression</h3>
                <p style={{ color: "#777", marginBottom: 24 }}>Supprimer <strong style={{ color: "#fff" }}>{modal.data.name}</strong> définitivement ?</p>
                <div style={{ display: "flex", gap: 12 }}>
                  <button style={{ ...A.btnGhost, flex: 1 }} onClick={() => setModal(null)}>Annuler</button>
                  <button style={{ background: "#ef4444", color: "#fff", border: "none", padding: "11px", borderRadius: 10, cursor: "pointer", flex: 1, fontWeight: 800, fontFamily: "'DM Sans',sans-serif" }} onClick={() => deleteVehicle(modal.data.id)}>Supprimer</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside style={{ ...A.sidebar, width: sidebarOpen ? 228 : 64 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 14px", borderBottom: "1px solid #141414", height: 62 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>⚡</span>
            {sidebarOpen && <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 17, color: "#FFD600", whiteSpace: "nowrap" }}>EcoRide</span>}
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav style={{ flex: 1, paddingTop: 6 }}>
          {MENU.map(m => (
            <button key={m.id} onClick={() => setPage(m.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", color: page === m.id ? "#FFD600" : "#555", padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans',sans-serif", borderRight: page === m.id ? "2px solid #FFD600" : "2px solid transparent", background: page === m.id ? "#FFD60008" : "none", justifyContent: sidebarOpen ? "flex-start" : "center" }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{m.icon}</span>
              {sidebarOpen && <span style={{ flex: 1, textAlign: "left" }}>{m.label}</span>}
              {sidebarOpen && m.badge > 0 && <span style={{ background: "#FF6B35", color: "#fff", fontSize: 10, fontWeight: 900, padding: "1px 6px", borderRadius: 8 }}>{m.badge}</span>}
            </button>
          ))}
        </nav>

        <div style={{ padding: sidebarOpen ? "14px" : "8px", borderTop: "1px solid #141414" }}>
          {sidebarOpen && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, background: "#FFD60022", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{ROLE_META[profile.role]?.icon}</div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name}</div>
                <div style={{ fontSize: 10, color: ROLE_META[profile.role]?.color }}>{ROLE_META[profile.role]?.label}</div>
              </div>
            </div>
          )}
          <button onClick={logout} style={{ ...A.btnGhost, width: "100%", padding: "7px", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {sidebarOpen ? "🚪 Déconnexion" : "🚪"}
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <header style={A.topbar}>
          <div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: -.5 }}>
              {MENU.find(m => m.id === page)?.icon} {MENU.find(m => m.id === page)?.label}
            </h2>
            <p style={{ color: "#444", fontSize: 11, marginTop: 2 }}>{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {stats.pending > 0 && <div style={{ background: "#FF6F0015", border: "1px solid #FF6F0033", color: "#FF6F00", padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>⏳ {stats.pending} en attente</div>}
            {stats.newQuotes > 0 && <div style={{ background: "#6C3EFF15", border: "1px solid #6C3EFF33", color: "#9B6DFF", padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>📋 {stats.newQuotes} nouveau{stats.newQuotes > 1 ? "x" : ""} devis</div>}
          </div>
        </header>

        <div style={{ padding: "24px", flex: 1 }}>
          {loading && page === "dashboard" ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ width: 34, height: 34, border: "3px solid #1a1a1a", borderTop: "3px solid #FFD600", borderRadius: "50%", margin: "0 auto 10px", animation: "spin 1s linear infinite" }} />
              <p style={{ color: "#444", fontSize: 13 }}>Chargement...</p>
            </div>
          ) : (
            <div style={{ animation: "fadeUp .4s ease" }}>

              {/* ══ DASHBOARD ══ */}
              {page === "dashboard" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 22 }}>
                    {[
                      { icon: "💰", label: "Chiffre d'affaires", val: formatPrice(stats.revenue || 0), color: "#FFD600", sub: `${stats.total || 0} commandes` },
                      { icon: "📦", label: "Commandes confirmées", val: stats.confirmed || 0, color: "#00C853", sub: `${stats.pending || 0} en attente` },
                      { icon: "🚗", label: "Stock total", val: (stats.stock || 0) + " unités", color: "#2979FF", sub: `${stats.activeVehicles || 0} modèles actifs` },
                      { icon: "📋", label: "Devis nouveaux", val: stats.newQuotes || 0, color: "#FF6B35", sub: "À traiter" },
                    ].map(k => (
                      <div key={k.label} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: "18px 16px", borderTop: `3px solid ${k.color}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ fontSize: 26 }}>{k.icon}</span>
                          <span style={{ background: k.color + "11", color: k.color, padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{k.sub}</span>
                        </div>
                        <div style={{ fontSize: k.val.toString().length > 10 ? 16 : 22, fontWeight: 900, color: "#f0f0f0", marginBottom: 4 }}>{k.val}</div>
                        <div style={{ color: "#555", fontSize: 11 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
                    <div style={A.card}>
                      <h3 style={A.cardTitle}>Ventes par modèle</h3>
                      {vehicles.length === 0 ? <p style={{ color: "#444", fontSize: 13 }}>Aucun véhicule</p> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {[...vehicles].sort((a, b) => b.sales_count - a.sales_count).slice(0, 5).map(v => {
                            const max = Math.max(...vehicles.map(x => x.sales_count || 0)) || 1;
                            return (
                              <div key={v.id}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                  <span style={{ color: "#bbb" }}>{v.icon} {v.name}</span>
                                  <span style={{ fontWeight: 800, color: "#FFD600" }}>{v.sales_count || 0}</span>
                                </div>
                                <div style={{ height: 5, background: "#1a1a1a", borderRadius: 3 }}>
                                  <div style={{ height: 5, borderRadius: 3, background: "linear-gradient(90deg,#FF6B35,#FFD600)", width: `${((v.sales_count || 0) / max) * 100}%`, transition: "width .6s ease" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div style={A.card}>
                      <h3 style={A.cardTitle}>Statut des commandes</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {Object.entries(STATUS_META).map(([k, m]) => {
                          const count = orders.filter(o => o.status === k).length;
                          const pct = orders.length ? (count / orders.length) * 100 : 0;
                          return (
                            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                              <span style={{ color: "#aaa", fontSize: 12, flex: 1 }}>{m.label}</span>
                              <span style={{ fontWeight: 800, color: m.color, fontSize: 14 }}>{count}</span>
                              <div style={{ width: 70, height: 5, background: "#1a1a1a", borderRadius: 3 }}>
                                <div style={{ height: 5, borderRadius: 3, background: m.color, width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Recent orders */}
                  <div style={A.card}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                      <h3 style={A.cardTitle}>Dernières commandes</h3>
                      <button style={A.btnSm} onClick={() => setPage("orders")}>Tout voir →</button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={A.table}>
                        <thead><tr>{["ID", "Client", "Véhicule", "Montant", "Paiement", "Statut", "Date"].map(h => <th key={h} style={A.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {orders.slice(0, 5).map(o => (
                            <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setModal({ type: "orderDetail", data: o })}>
                              <td style={A.td}><span style={{ fontWeight: 800, color: "#FFD600", fontSize: 12 }}>{o.id}</span></td>
                              <td style={A.td}>{o.client_name}</td>
                              <td style={A.td}><span style={{ color: "#888" }}>{o.vehicle_name}</span></td>
                              <td style={A.td}><span style={{ fontWeight: 700, color: "#FF6B35" }}>{formatPrice(o.amount)}</span></td>
                              <td style={A.td}><span style={{ color: "#777", fontSize: 11 }}>{o.payment?.toUpperCase()}</span></td>
                              <td style={A.td}><SBadge status={o.status} /></td>
                              <td style={A.td}><span style={{ color: "#444", fontSize: 11 }}>{new Date(o.created_at).toLocaleDateString("fr-FR")}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {vehicles.some(v => (v.stock || 0) <= 3) && (
                    <div style={{ background: "#FF6F0010", border: "1px solid #FF6F0030", borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
                      <h4 style={{ color: "#FF6F00", fontWeight: 800, marginBottom: 10 }}>⚠️ Stock faible</h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {vehicles.filter(v => (v.stock || 0) <= 3).map(v => (
                          <div key={v.id} style={{ background: "#1a1a1a", borderRadius: 7, padding: "6px 12px", fontSize: 12 }}>
                            {v.icon} <strong>{v.name}</strong> — <span style={{ color: "#FF6F00" }}>{v.stock} unité{v.stock > 1 ? "s" : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ══ ORDERS ══ */}
              {page === "orders" && (
                <div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
                    <input placeholder="🔍 Client ou référence..." style={{ ...A.fi, flex: 1, minWidth: 180 }} value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
                    {["tous", ...Object.keys(STATUS_META)].map(f => (
                      <button key={f} onClick={() => setOrderFilter(f)}
                        style={{ background: orderFilter === f ? (STATUS_META[f]?.color || "#FF6B35") + "22" : "#111", border: `1px solid ${orderFilter === f ? (STATUS_META[f]?.color || "#FF6B35") : "#1e1e1e"}`, color: orderFilter === f ? (STATUS_META[f]?.color || "#FF6B35") : "#555", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                        {f === "tous" ? "Tous" : STATUS_META[f].label}
                      </button>
                    ))}
                    <button style={A.btnSm} onClick={loadOrders}>↻ Actualiser</button>
                  </div>
                  <div style={A.card}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={A.table}>
                        <thead><tr>{["ID", "Client", "Téléphone", "Véhicule", "Montant", "Paiement", "Statut", "Date", ""].map(h => <th key={h} style={A.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {filteredOrders.map(o => (
                            <tr key={o.id}>
                              <td style={A.td}><span style={{ fontWeight: 800, color: "#FFD600", fontSize: 11 }}>{o.id}</span></td>
                              <td style={A.td}>{o.client_name}</td>
                              <td style={A.td}><span style={{ color: "#666" }}>{o.client_phone}</span></td>
                              <td style={A.td}>{o.vehicle_name}</td>
                              <td style={A.td}><span style={{ fontWeight: 700, color: "#FF6B35" }}>{formatPrice(o.amount)}</span></td>
                              <td style={A.td}><span style={{ fontSize: 11, color: "#888" }}>{o.payment?.toUpperCase()}</span></td>
                              <td style={A.td}><SBadge status={o.status} /></td>
                              <td style={A.td}><span style={{ color: "#444", fontSize: 11 }}>{new Date(o.created_at).toLocaleDateString("fr-FR")}</span></td>
                              <td style={A.td}><button style={A.btnXs} onClick={() => setModal({ type: "orderDetail", data: o })}>Détail</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredOrders.length === 0 && <p style={{ textAlign: "center", color: "#333", padding: "36px 0", fontSize: 13 }}>Aucune commande trouvée</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ DELIVERY ══ */}
              {page === "delivery" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <p style={{ color: "#666", fontSize: 13 }}>{orders.filter(o => o.status === "confirmé").length} livraison(s) à effectuer</p>
                    <button style={A.btnSm} onClick={loadOrders}>↻ Actualiser</button>
                  </div>
                  <div style={A.card}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={A.table}>
                        <thead><tr>{["ID", "Client", "Téléphone", "Ville", "Adresse", "Véhicule", "Action"].map(h => <th key={h} style={A.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {orders.filter(o => o.status === "confirmé").map(o => (
                            <tr key={o.id}>
                              <td style={A.td}><span style={{ fontWeight: 800, color: "#FFD600", fontSize: 11 }}>{o.id}</span></td>
                              <td style={A.td}>{o.client_name}</td>
                              <td style={A.td}>{o.client_phone}</td>
                              <td style={A.td}>{o.city}</td>
                              <td style={A.td}><span style={{ color: "#666", fontSize: 11 }}>{o.address || "À confirmer"}</span></td>
                              <td style={A.td}>{o.vehicle_name}</td>
                              <td style={A.td}>
                                <button style={{ ...A.btnXs, background: "#00C85322", borderColor: "#00C85344", color: "#00C853" }}
                                  onClick={() => updateOrderStatus(o.id, "livré")}>✓ Livré</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {orders.filter(o => o.status === "confirmé").length === 0 && (
                        <p style={{ textAlign: "center", color: "#333", padding: "36px 0", fontSize: 13 }}>✅ Aucune livraison en attente</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ QUOTES ══ */}
              {page === "quotes" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <p style={{ color: "#666", fontSize: 13 }}>{quotes.length} demande(s) · <span style={{ color: "#9B6DFF" }}>{stats.newQuotes} nouvelle(s)</span></p>
                    <button style={A.btnSm} onClick={loadQuotes}>↻ Actualiser</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {quotes.map(q => (
                      <div key={q.id} style={{ background: "#111", border: `1px solid ${q.status === "nouveau" ? "#6C3EFF33" : "#1a1a1a"}`, borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 5 }}>
                            <span style={{ fontWeight: 800 }}>{q.client_name}</span>
                            <span style={{ background: q.status === "nouveau" ? "#6C3EFF22" : "#1a1a1a", color: q.status === "nouveau" ? "#9B6DFF" : "#444", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{q.status === "nouveau" ? "NOUVEAU" : "Traité"}</span>
                          </div>
                          <div style={{ color: "#666", fontSize: 12, marginBottom: 3 }}>📱 {q.client_phone} {q.vehicle_name ? `· 🚗 ${q.vehicle_name}` : ""}</div>
                          <p style={{ color: "#555", fontSize: 12 }}>{(q.message || "").slice(0, 100)}...</p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                          <span style={{ color: "#333", fontSize: 11 }}>{new Date(q.created_at).toLocaleDateString("fr-FR")}</span>
                          <button style={A.btnXs} onClick={() => setModal({ type: "quoteDetail", data: q })}>Voir</button>
                        </div>
                      </div>
                    ))}
                    {quotes.length === 0 && <p style={{ color: "#333", fontSize: 13, textAlign: "center", padding: "36px 0" }}>Aucun devis reçu</p>}
                  </div>
                </div>
              )}

              {/* ══ VEHICLES ══ */}
              {page === "vehicles" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                    <p style={{ color: "#666", fontSize: 13 }}>{vehicles.length} véhicule(s) au catalogue</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={A.btnSm} onClick={loadVehicles}>↻ Actualiser</button>
                      {can("vehicles") && (
                        <button style={A.btnPrimary} onClick={() => { setVehicleForm({ name: "", price: 0, old_price: null, range_km: 0, seats: 4, ac: true, speed: 60, charge_time: "6-8h", category: "citadine", badge: "", icon: "🚗", stock: 0, status: "actif", description: "", _new: true }); setModal({ type: "addVehicle" }); }}>
                          + Ajouter
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                    {vehicles.map(v => (
                      <div key={v.id} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 13, overflow: "hidden" }}>
                        <div style={{ background: "#161616", padding: "18px", textAlign: "center", position: "relative" }}>
                          <div style={{ fontSize: 50 }}>{v.icon}</div>
                          <span style={{ position: "absolute", top: 10, left: 10, background: v.status === "actif" ? "#00C85322" : "#ef444422", color: v.status === "actif" ? "#00C853" : "#ef4444", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{v.status}</span>
                          <span style={{ position: "absolute", top: 10, right: 10, background: "#1a1a1a", color: (v.stock || 0) <= 3 ? "#FF6F00" : "#555", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{v.stock || 0} stock</span>
                        </div>
                        <div style={{ padding: "14px 16px 16px" }}>
                          <h4 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 15, marginBottom: 4 }}>{v.name}</h4>
                          <div style={{ color: "#FF6B35", fontWeight: 900, fontSize: 16, marginBottom: 10 }}>{formatPrice(v.price)}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                            <span style={A.pill}>🔋 {v.range_km}km</span><span style={A.pill}>💺 {v.seats}pl</span>
                            {v.ac && <span style={A.pill}>❄️</span>}
                            <span style={A.pill}>📊 {v.sales_count || 0}</span>
                          </div>
                          {can("vehicles") && (
                            <div style={{ display: "flex", gap: 7 }}>
                              <button style={{ ...A.btnXs, flex: 1, background: "#2979FF15", borderColor: "#2979FF33", color: "#2979FF" }} onClick={() => { setVehicleForm({ ...v }); setModal({ type: "editVehicle" }); }}>✏️ Modifier</button>
                              <button style={{ ...A.btnXs, flex: 1, background: "#ef444415", borderColor: "#ef444433", color: "#ef4444" }} onClick={() => setModal({ type: "confirmDelete", data: v })}>🗑️</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ══ TEAM ══ */}
              {page === "team" && (
                <div>
                  <div style={{ marginBottom: 18 }}>
                    <p style={{ color: "#666", fontSize: 13 }}>{team.length} membre(s). Pour ajouter un membre, créez l'utilisateur dans <strong style={{ color: "#FFD600" }}>Supabase → Authentication → Users</strong> avec le metadata JSON : <code style={{ background: "#1a1a1a", padding: "2px 6px", borderRadius: 4, fontSize: 11, color: "#aaa" }}>{`{"name":"Prénom Nom","role":"vendeur"}`}</code></p>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 14 }}>
                    {team.map(m => (
                      <div key={m.id} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 13, padding: 18 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                          <div style={{ width: 44, height: 44, background: (ROLE_META[m.role]?.color || "#888") + "22", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{ROLE_META[m.role]?.icon}</div>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: ROLE_META[m.role]?.color, marginTop: 2 }}>{ROLE_META[m.role]?.label}</div>
                          </div>
                          <span style={{ background: m.status === "actif" ? "#00C85322" : "#ef444422", color: m.status === "actif" ? "#00C853" : "#ef4444", padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>{m.status}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}>
                          <div style={{ color: "#555" }}>✉️ {m.email}</div>
                          {m.city && <div style={{ color: "#555" }}>📍 {m.city}</div>}
                          {m.phone && <div style={{ color: "#555" }}>📱 {m.phone}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ══ SETTINGS ══ */}
              {page === "settings" && (
                <div style={{ maxWidth: 660 }}>
                  <div style={A.card}>
                    <h3 style={{ ...A.cardTitle, marginBottom: 18 }}>Mon profil</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                      <div><label style={A.fl}>Nom</label><input style={A.fi} defaultValue={profile.name} /></div>
                      <div><label style={A.fl}>Email</label><input defaultValue={session.user.email} disabled style={{ ...A.fi, opacity: .5 }} /></div>
                      <div><label style={A.fl}>Ville</label><input style={A.fi} defaultValue={profile.city} /></div>
                      <div><label style={A.fl}>Téléphone</label><input style={A.fi} defaultValue={profile.phone || ""} /></div>
                      <button style={{ ...A.btnPrimary, alignSelf: "flex-start" }} onClick={() => showToast("Profil mis à jour ✓")}>Sauvegarder</button>
                    </div>
                  </div>
                  <div style={{ ...A.card, marginTop: 16 }}>
                    <h3 style={{ ...A.cardTitle, marginBottom: 14 }}>Connexion Supabase</h3>
                    <div style={{ background: "#1a1a1a", borderRadius: 10, padding: 16, fontSize: 12, color: "#666", lineHeight: 1.8 }}>
                      <div>🟢 <strong style={{ color: "#00C853" }}>Connecté</strong></div>
                      <div>URL : <span style={{ color: "#aaa" }}>{SUPABASE_URL.slice(0, 40)}...</span></div>
                      <div>Utilisateur : <span style={{ color: "#aaa" }}>{session.user.email}</span></div>
                      <div>Rôle : <span style={{ color: ROLE_META[profile.role]?.color }}>{ROLE_META[profile.role]?.label}</span></div>
                    </div>
                  </div>
                  <div style={{ ...A.card, marginTop: 16, borderColor: "#ef444422" }}>
                    <h3 style={{ ...A.cardTitle, color: "#ef4444", marginBottom: 10 }}>Déconnexion</h3>
                    <button style={{ background: "#ef444422", border: "1px solid #ef444433", color: "#ef4444", padding: "10px 20px", borderRadius: 9, cursor: "pointer", fontWeight: 800, fontFamily: "'DM Sans',sans-serif" }} onClick={logout}>
                      🚪 Se déconnecter
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: "#888" };
  return <span style={{ background: m.color + "22", color: m.color, padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 800 }}>{m.label}</span>;
}

const A = {
  root: { display: "flex", background: "#0a0a0a", minHeight: "100vh", color: "#f0f0f0", fontFamily: "'DM Sans',sans-serif" },
  loginBg: { minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'DM Sans',sans-serif" },
  loginCard: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 18, padding: 36, width: "100%", maxWidth: 400, animation: "fadeUp .5s ease" },
  toast: { position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "11px 18px", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 8px 28px rgba(0,0,0,.5)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(5px)" },
  modalBox: { background: "#161616", border: "1px solid #222", borderRadius: 18, padding: 28, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 18, marginBottom: 18 },
  sidebar: { background: "#0d0d0d", borderRight: "1px solid #141414", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0, flexShrink: 0, transition: "width .22s ease", overflow: "hidden" },
  topbar: { background: "#0d0d0d", borderBottom: "1px solid #141414", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 50 },
  card: { background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 },
  cardTitle: { fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { background: "#0d0d0d", color: "#444", padding: "9px 13px", textAlign: "left", fontWeight: 700, borderBottom: "1px solid #141414", whiteSpace: "nowrap" },
  td: { padding: "10px 13px", borderBottom: "1px solid #111", color: "#bbb", whiteSpace: "nowrap" },
  pill: { background: "#1a1a1a", border: "1px solid #1e1e1e", color: "#666", padding: "3px 9px", borderRadius: 20, fontSize: 10 },
  btnPrimary: { background: "#FF6B35", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  btnGhost: { background: "#1a1a1a", color: "#aaa", border: "1px solid #1e1e1e", padding: "9px 14px", borderRadius: 9, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  btnSm: { background: "#111", border: "1px solid #1e1e1e", color: "#666", padding: "6px 13px", borderRadius: 7, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans',sans-serif" },
  btnXs: { background: "#111", border: "1px solid #1e1e1e", color: "#888", padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 11, fontFamily: "'DM Sans',sans-serif" },
  fl: { color: "#666", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 5 },
  fi: { background: "#1a1a1a", border: "1px solid #1e1e1e", color: "#f0f0f0", padding: "9px 12px", borderRadius: 8, fontSize: 13, width: "100%", fontFamily: "'DM Sans',sans-serif" },
};
