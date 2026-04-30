import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ── CONFIG — Remplace par tes vraies valeurs ───────────────
const SUPABASE_URL = "https://ogpimhgsvagewclivaug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncGltaGdzdmFnZXdjbGl2YXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjE1MjQsImV4cCI6MjA5MjMzNzUyNH0.3r5oHkt8mQSIbnAyOxpCpn1VTSvkjdLZgk3DmIDAsqQ";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
// ──────────────────────────────────────────────────────────

const formatPrice = (p) => Number(p).toLocaleString("fr-FR") + " FCFA";

const PAYMENT_METHODS = [
  { id: "mtn",      label: "MTN MoMo",       icon: "📱", color: "#FFCB05" },
  { id: "moov",     label: "Moov Money",      icon: "📱", color: "#0099CC" },
  { id: "wave",     label: "Wave",            icon: "🌊", color: "#1BC5DD" },
  { id: "celtiis", label: "Celtiis cash"     ,icon: "📱", color: "#43A047" },
  { id: "virement", label: "Virement bancaire",icon: "💳", color: "#43A047" }
];

const STATUS_META = {
  en_attente: { label: "En attente",  color: "#FF6F00" },
  confirmé:   { label: "Confirmé",    color: "#00C853" },
  livré:      { label: "Livré",       color: "#2979FF" },
  annulé:     { label: "Annulé",      color: "#ef4444" },
};

// ─────────────────────── APP ───────────────────────────────
export default function ClientApp() {
  const [page, setPage] = useState("home");
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [compareList, setCompareList] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [filterCat, setFilterCat] = useState("tous");
  const [filterSeats, setFilterSeats] = useState("tous");
  const [sortBy, setSortBy] = useState("default");
  const [searchTerm, setSearchTerm] = useState("");
  const [colorChoices, setColorChoices] = useState({});
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const [faqOpen, setFaqOpen] = useState(null);

  // Order flow
  const [orderStep, setOrderStep] = useState(1);
  const [orderData, setOrderData] = useState({ name:"", phone:"", email:"", city:"Cotonou", address:"", payment:"mtn", installments:1 });
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);

  // Quote
  const [quoteForm, setQuoteForm] = useState({ name:"", phone:"", email:"", message:"", vehicleId:"" });
  const [quoteSent, setQuoteSent] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // Order tracking
  const [trackingId, setTrackingId] = useState("");
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const navTo = (p) => { setPage(p); setMobileMenu(false); window.scrollTo(0, 0); };

  // ── LOAD VEHICLES ─────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await sb.from("vehicles").select("*").eq("status", "actif").order("sales_count", { ascending: false });
        if (error) throw error;
        setVehicles(data || []);
      } catch (e) {
        showToast("Erreur chargement véhicules", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── REALTIME new vehicles ──────────────────────────────────
  useEffect(() => {
    const ch = sb.channel("vehicles-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => {
        sb.from("vehicles").select("*").eq("status", "actif").order("sales_count", { ascending: false })
          .then(({ data }) => data && setVehicles(data));
      }).subscribe();
    return () => sb.removeChannel(ch);
  }, []);

  // ── CART ──────────────────────────────────────────────────
  const addToCart = (v) => {
    if (cart.find(c => c.id === v.id)) { showToast("Déjà dans votre panier", "info"); return; }
    setCart([...cart, { ...v, chosenColor: colorChoices[v.id] || (v.colors?.[0]) }]);
    showToast(`${v.name} ajouté au panier ✓`);
  };

  const removeFromCart = (id) => setCart(cart.filter(c => c.id !== id));

  // ── FILTER ────────────────────────────────────────────────
  const filtered = vehicles.filter(v => {
    if (filterCat !== "tous" && v.category !== filterCat) return false;
    if (filterSeats !== "tous" && v.seats !== parseInt(filterSeats)) return false;
    if (searchTerm && !v.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === "price-asc") return a.price - b.price;
    if (sortBy === "price-desc") return b.price - a.price;
    if (sortBy === "range") return b.range_km - a.range_km;
    return 0;
  });

  // ── SUBMIT ORDER ──────────────────────────────────────────
  const submitOrder = async () => {
    if (!orderData.name || !orderData.phone) { showToast("Nom et téléphone requis", "error"); return; }
    setOrderLoading(true);
    try {
      const rows = cart.map(v => ({
        client_name: orderData.name, client_phone: orderData.phone,
        client_email: orderData.email || null, city: orderData.city,
        address: orderData.address || null, vehicle_id: v.id,
        vehicle_name: v.name, amount: v.price, payment: orderData.payment,
        installments: orderData.installments, chosen_color: colorChoices[v.id] || null,
        status: "en_attente",
      }));
      const { data, error } = await sb.from("orders").insert(rows[0]).select().single();
      if (error) throw error;
      // Tracking steps
      await sb.from("order_tracking").insert([
        { order_id: data.id, step: "1", label: "Commande reçue", done: true },
        { order_id: data.id, step: "2", label: "Traitement en cours", done: true },
        { order_id: data.id, step: "3", label: "Contact par notre agent", done: false },
        { order_id: data.id, step: "4", label: "Paiement confirmé", done: false },
        { order_id: data.id, step: "5", label: "Livraison / Retrait", done: false },
      ]);
      setOrderSuccess(data);
      setCart([]);
      setOrderStep(1);
      navTo("suivi");
    } catch (e) {
      showToast("Erreur lors de la commande : " + e.message, "error");
    } finally {
      setOrderLoading(false);
    }
  };

  // ── SUBMIT QUOTE ──────────────────────────────────────────
  const submitQuote = async () => {
    if (!quoteForm.name || !quoteForm.phone || !quoteForm.message) {
      showToast("Nom, téléphone et message requis", "error"); return;
    }
    setQuoteLoading(true);
    try {
      const { error } = await sb.from("quotes").insert({
        client_name: quoteForm.name, client_phone: quoteForm.phone,
        client_email: quoteForm.email || null, message: quoteForm.message,
        vehicle_id: quoteForm.vehicleId || null,
        vehicle_name: vehicles.find(v => v.id === quoteForm.vehicleId)?.name || null,
      });
      if (error) throw error;
      setQuoteSent(true);
    } catch (e) {
      showToast("Erreur envoi devis : " + e.message, "error");
    } finally {
      setQuoteLoading(false);
    }
  };

  // ── ORDER TRACKING ────────────────────────────────────────
  const lookupOrder = async () => {
    if (!trackingId.trim()) return;
    setTrackingLoading(true);
    setTrackingError("");
    try {
      const { data, error } = await sb.from("orders")
        .select("*, order_tracking(*)")
        .eq("id", trackingId.toUpperCase().trim())
        .single();
      if (error || !data) { setTrackingError("Commande introuvable. Vérifiez votre référence."); setTrackingData(null); }
      else setTrackingData(data);
    } catch { setTrackingError("Erreur de connexion."); }
    finally { setTrackingLoading(false); }
  };

  const NAV = [
    { label: "Accueil", id: "home" }, { label: "Catalogue", id: "catalogue" },
    { label: "Comparer", id: "compare" }, { label: "Commander", id: "order" },
    { label: "Suivi", id: "suivi" }, { label: "Contact", id: "contact" },
  ];

  const totalCartAmount = cart.reduce((s, v) => s + v.price, 0);

  // ─── RENDER ──────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        @keyframes floatCar{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-16px) rotate(2deg)}}
        @keyframes slideIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .hov-card:hover{transform:translateY(-5px)!important;border-color:#FF6B3566!important;box-shadow:0 20px 50px rgba(255,107,53,.12)!important}
        .hov-btn:hover{filter:brightness(1.1);transform:scale(1.02)}
        nav a:hover,button.nav-lnk:hover{color:#FFD600!important}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#080808}::-webkit-scrollbar-thumb{background:#222;border-radius:3px}
        input:focus,select:focus,textarea:focus{border-color:#FF6B35!important;outline:none}
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{ ...S.toast, background: toast.type === "success" ? "#FF6B35" : toast.type === "info" ? "#2979FF" : "#ef4444", animation: "slideIn .3s ease" }}>
          {toast.type === "success" ? "✓" : toast.type === "info" ? "ℹ" : "⚠"} {toast.msg}
        </div>
      )}

      {/* CART FAB */}
      {cart.length > 0 && (
        <button onClick={() => navTo("order")} style={S.cartFab} className="hov-btn">
          🛒 <span style={S.cartBadge}>{cart.length}</span>
        </button>
      )}

      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.navInner}>
          <div style={S.logo} onClick={() => navTo("home")}>
            <span style={{ fontSize: 26 }}>⚡</span>
            <div><div style={S.logoName}>EcoRide</div><div style={S.logoSub}>AFRIQUE ÉLECTRIQUE</div></div>
          </div>
          <div style={S.navLinks}>
            {NAV.map(n => (
              <button key={n.id} className="nav-lnk" onClick={() => navTo(n.id)}
                style={{ ...S.navLink, ...(page === n.id ? S.navActive : {}) }}>
                {n.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => navTo("order")} style={S.navCart}>
              🛒 {cart.length > 0 && <span style={S.cartDot}>{cart.length}</span>}
            </button>
            <button onClick={() => setMobileMenu(!mobileMenu)} style={S.burger}>{mobileMenu ? "✕" : "☰"}</button>
          </div>
        </div>
        {mobileMenu && (
          <div style={S.mobileMenu}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => navTo(n.id)}
                style={{ ...S.mobileLink, ...(page === n.id ? { color: "#FFD600", background: "#FFD60011" } : {}) }}>
                {n.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <main style={{ minHeight: "80vh" }}>

        {/* ══ HOME ══ */}
        {page === "home" && (
          <div>
            <section style={S.hero}>
              <div style={S.orb1} /><div style={S.orb2} />
              <div style={{ position: "relative", zIndex: 1, flex: "1 1 320px", animation: "fadeUp .7s ease" }}>
                <div style={S.heroPill}>🌍 Bénin · Sénégal · Côte d'Ivoire · Togo</div>
                <h1 style={S.heroTitle}>Roule <span style={{ color: "#FFD600" }}>Électrique</span>.<br />Paie <span style={{ color: "#FFD600" }}>Malin</span>.</h1>
                <p style={S.heroSub}>Mini voitures 100% électriques climatisées. Autonomie jusqu'à 280 km. Exonération douanes 99%. Paiement Mobile Money ou virement.</p>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 32 }}>
                  {[["−70%", "sur le carburant"], ["99%", "exo. douane"], ["3 ans", "garantie batterie"], ["200km", "autonomie min"]].map(([v, l]) => (
                    <div key={l}><div style={{ fontSize: 22, fontWeight: 900, color: "#FF6B35" }}>{v}</div><div style={{ fontSize: 11, color: "#666" }}>{l}</div></div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="hov-btn" style={S.btnPrimary} onClick={() => navTo("catalogue")}>Voir les modèles →</button>
                  <button style={S.btnOutline} onClick={() => navTo("contact")}>Devis gratuit</button>
                </div>
              </div>
              <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
                <div style={{ fontSize: "clamp(90px,14vw,150px)", animation: "floatCar 4s ease-in-out infinite", filter: "drop-shadow(0 30px 50px rgba(255,107,53,.3))" }}>🚗</div>
                <div style={{ width: "60%", height: 12, margin: "6px auto 0", background: "radial-gradient(ellipse,#FF6B3533 0%,transparent 70%)", borderRadius: "50%" }} />
              </div>
            </section>

            <div style={S.trustBar}>
              {["✅ Véhicules homologués", "📦 Livraison à domicile", "🔧 SAV certifié Cotonou", "💳 Mobile Money & Virement", "🛡️ Garantie 2 ans"].map(t => (
                <span key={t} style={{ color: "#555", fontSize: 13 }}>{t}</span>
              ))}
            </div>

            {/* Featured */}
            <div style={S.section}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                <h2 style={S.sectionTitle}>Nos véhicules phares</h2>
                <button style={S.seeAll} onClick={() => navTo("catalogue")}>Tout voir →</button>
              </div>
              {loading ? <Loader /> : (
                <div style={S.grid}>
                  {vehicles.slice(0, 3).map(v => (
                    <VCard key={v.id} v={v}
                      onSelect={() => { setSelectedVehicle(v); setGalleryIdx(0); navTo("detail"); }}
                      onCart={() => addToCart(v)}
                      inWish={wishlist.includes(v.id)} onWish={() => setWishlist(w => w.includes(v.id) ? w.filter(x => x !== v.id) : [...w, v.id])}
                      inCompare={!!compareList.find(c => c.id === v.id)}
                      onCompare={() => {
                        if (compareList.find(c => c.id === v.id)) { setCompareList(compareList.filter(c => c.id !== v.id)); return; }
                        if (compareList.length >= 3) { showToast("Max 3 véhicules", "info"); return; }
                        setCompareList([...compareList, v]);
                      }}
                      chosenColor={colorChoices[v.id]}
                      onColor={c => setColorChoices({ ...colorChoices, [v.id]: c })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Steps */}
            <div style={{ ...S.section, background: "#111", borderRadius: 20, padding: "48px 32px" }}>
              <h2 style={{ ...S.sectionTitle, textAlign: "center", marginBottom: 36 }}>Commander en 3 étapes</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 24, textAlign: "center" }}>
                {[{ s: "01", i: "🔍", t: "Choisissez votre modèle", d: "Parcourez, comparez, sélectionnez couleur et options." },
                  { s: "02", i: "📱", t: "Passez commande", d: "Formulaire rapide, paiement Mobile Money ou virement." },
                  { s: "03", i: "🚗", t: "Recevez votre véhicule", d: "Livraison chez vous. Mise en main et formation incluses." }].map(x => (
                  <div key={x.s} style={{ padding: 20 }}>
                    <div style={{ fontSize: 48, marginBottom: 10 }}>{x.i}</div>
                    <div style={{ color: "#FF6B35", fontWeight: 900, fontSize: 12, letterSpacing: 2, marginBottom: 8 }}>ÉTAPE {x.s}</div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{x.t}</h3>
                    <p style={{ color: "#777", fontSize: 13, lineHeight: 1.6 }}>{x.d}</p>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: "center", marginTop: 28 }}>
                <button className="hov-btn" style={S.btnPrimary} onClick={() => navTo("order")}>Commander maintenant</button>
              </div>
            </div>

            {/* FAQ */}
            <div style={S.section}>
              <h2 style={{ ...S.sectionTitle, marginBottom: 24 }}>Questions fréquentes</h2>
              <div style={{ maxWidth: 680 }}>
                {[
                  ["Comment recharger à Cotonou ?", "Sur n'importe quelle prise 220V. Charge complète 6-8h. Câble et borne murale fournis à l'achat."],
                  ["Et en cas de coupure de courant ?", "Nous proposons un kit solaire + batterie de stockage en option pour recharger indépendamment du réseau."],
                  ["Peut-on payer en plusieurs fois ?", "Oui, en 3, 6 ou 12 mensualités via MTN MoMo, Moov, Wave ou virement bancaire."],
                  ["Les véhicules sont-ils homologués ?", "Oui, dédouanés et homologués."],
                ].map(([q, a], i) => (
                  <div key={i} style={{ borderBottom: "1px solid #1a1a1a", marginBottom: 4 }}>
                    <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                      style={{ width: "100%", textAlign: "left", background: "none", border: "none", color: "#f0f0f0", padding: "15px 0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "space-between", fontFamily: "'DM Sans',sans-serif" }}>
                      {q} <span style={{ color: "#FF6B35", fontSize: 20 }}>{faqOpen === i ? "−" : "+"}</span>
                    </button>
                    {faqOpen === i && <p style={{ color: "#888", fontSize: 14, lineHeight: 1.7, paddingBottom: 14 }}>{a}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ CATALOGUE ══ */}
        {page === "catalogue" && (
          <div style={S.pageWrap}>
            <h1 style={S.pageTitle}>Catalogue</h1>
            <p style={{ color: "#666", marginBottom: 24 }}>{filtered.length} modèle{filtered.length > 1 ? "s" : ""}</p>

            <div style={{ background: "#111", borderRadius: 14, padding: 20, marginBottom: 28, border: "1px solid #1a1a1a", display: "flex", flexDirection: "column", gap: 14 }}>
              <input placeholder="🔍 Rechercher..." style={S.fi} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {["tous", "citadine", "premium", "utilitaire", "familiale", "professionnel"].map(c => (
                  <button key={c} onClick={() => setFilterCat(c)} style={{ ...S.pill, ...(filterCat === c ? { background: "#FF6B3322", borderColor: "#FF6B35", color: "#FF6B35" } : {}) }}>
                    {c === "tous" ? "Tous" : c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select style={{ ...S.fi, width: "auto" }} value={filterSeats} onChange={e => setFilterSeats(e.target.value)}>
                  <option value="tous">Tous sièges</option><option value="2">2 places</option><option value="4">4 places</option><option value="6">6 places</option>
                </select>
                <select style={{ ...S.fi, width: "auto" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="default">Par défaut</option><option value="price-asc">Prix ↑</option><option value="price-desc">Prix ↓</option><option value="range">Autonomie ↓</option>
                </select>
              </div>
            </div>

            {compareList.length > 0 && (
              <div style={{ background: "#FF6B3511", border: "1px solid #FF6B3533", borderRadius: 10, padding: "10px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: "#FF6B35", fontWeight: 700, fontSize: 13 }}>🔄 {compareList.map(c => c.name).join(" · ")}</span>
                <button style={{ ...S.btnPrimary, padding: "7px 14px", fontSize: 12 }} onClick={() => navTo("compare")}>Comparer</button>
              </div>
            )}

            {loading ? <Loader /> : (
              <div style={S.grid}>
                {filtered.map(v => (
                  <VCard key={v.id} v={v}
                    onSelect={() => { setSelectedVehicle(v); setGalleryIdx(0); navTo("detail"); }}
                    onCart={() => addToCart(v)}
                    inWish={wishlist.includes(v.id)} onWish={() => setWishlist(w => w.includes(v.id) ? w.filter(x => x !== v.id) : [...w, v.id])}
                    inCompare={!!compareList.find(c => c.id === v.id)}
                    onCompare={() => {
                      if (compareList.find(c => c.id === v.id)) { setCompareList(compareList.filter(c => c.id !== v.id)); return; }
                      if (compareList.length >= 3) { showToast("Max 3 véhicules", "info"); return; }
                      setCompareList([...compareList, v]);
                    }}
                    chosenColor={colorChoices[v.id]}
                    onColor={c => setColorChoices({ ...colorChoices, [v.id]: c })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ DETAIL ══ */}
        {page === "detail" && selectedVehicle && (
          <div style={S.pageWrap}>
            <button style={S.backBtn} onClick={() => navTo("catalogue")}>← Retour</button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "start" }}>
              <div>
                <div style={{ background: `linear-gradient(135deg,${selectedVehicle.colors?.[0] || "#FF6B35"}22,#161616)`, borderRadius: 18, padding: "48px 24px", textAlign: "center", marginBottom: 14, border: "1px solid #1e1e1e" }}>
                  <div style={{ fontSize: 110 }}>{selectedVehicle.icon || "🚗"}</div>
                  {selectedVehicle.old_price && <div style={{ background: "#FF6B35", color: "#fff", display: "inline-block", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, marginTop: 10 }}>PROMO -{Math.round((1 - selectedVehicle.price / selectedVehicle.old_price) * 100)}%</div>}
                </div>
                {selectedVehicle.colors?.length > 1 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ color: "#777", fontSize: 12, marginBottom: 8, fontWeight: 600 }}>COULEURS DISPONIBLES</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      {selectedVehicle.colors.map(c => (
                        <button key={c} onClick={() => setColorChoices({ ...colorChoices, [selectedVehicle.id]: c })}
                          style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: `3px solid ${colorChoices[selectedVehicle.id] === c || (!colorChoices[selectedVehicle.id] && c === selectedVehicle.colors[0]) ? "#FFD600" : "#333"}`, cursor: "pointer" }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                {selectedVehicle.badge && <span style={{ ...S.badge, background: selectedVehicle.badge_color || "#FF6B35" }}>{selectedVehicle.badge}</span>}
                <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 900, margin: "12px 0 8px", letterSpacing: -1 }}>{selectedVehicle.name}</h1>
                <p style={{ color: "#888", lineHeight: 1.7, marginBottom: 20 }}>{selectedVehicle.description}</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: "#FF6B35" }}>{formatPrice(selectedVehicle.price)}</span>
                  {selectedVehicle.old_price && <span style={{ color: "#444", textDecoration: "line-through", fontSize: 17 }}>{formatPrice(selectedVehicle.old_price)}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 22 }}>
                  {[["🔋", selectedVehicle.range_km + " km", "Autonomie"], ["💺", selectedVehicle.seats + " places", "Capacité"], ["⚡", selectedVehicle.speed + " km/h", "Vitesse"], ["⏱️", selectedVehicle.charge_time, "Recharge"], ["❄️", selectedVehicle.ac ? "Incluse" : "Option", "Climatisation"]].map(([ic, v, l]) => (
                    <div key={l} style={{ background: "#1a1a1a", borderRadius: 10, padding: "12px 8px", textAlign: "center", border: "1px solid #222" }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{ic}</div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#FFD600" }}>{v}</div>
                      <div style={{ color: "#555", fontSize: 10, marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {selectedVehicle.features && (
                  <div style={{ marginBottom: 24 }}>
                    <p style={{ color: "#777", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>ÉQUIPEMENTS</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {selectedVehicle.features.map(f => <span key={f} style={{ ...S.pill, color: "#bbb" }}>✓ {f}</span>)}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button className="hov-btn" style={{ ...S.btnPrimary, flex: 1 }} onClick={() => { addToCart(selectedVehicle); navTo("order"); }}>🛒 Commander</button>
                  <button style={{ ...S.btnOutline, flex: 1 }} onClick={() => addToCart(selectedVehicle)}>+ Panier</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ COMPARE ══ */}
        {page === "compare" && (
          <div style={S.pageWrap}>
            <h1 style={S.pageTitle}>Comparateur</h1>
            {compareList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>🔄</div>
                <p style={{ color: "#555", marginBottom: 20 }}>Ajoutez des véhicules depuis le catalogue.</p>
                <button style={S.btnPrimary} onClick={() => navTo("catalogue")}>Aller au catalogue</button>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width: 130, textAlign: "left" }}>Caractéristique</th>
                      {compareList.map(v => (
                        <th key={v.id} style={{ ...S.th, textAlign: "center" }}>
                          <div style={{ fontSize: 36, marginBottom: 6 }}>{v.icon}</div>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>{v.name}</div>
                          <button onClick={() => setCompareList(compareList.filter(c => c.id !== v.id))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, marginTop: 4 }}>✕</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[["Prix", v => formatPrice(v.price)], ["Autonomie", v => v.range_km + " km"], ["Places", v => v.seats], ["Vitesse max", v => v.speed + " km/h"], ["Climatisation", v => v.ac ? "✅" : "❌"], ["Catégorie", v => v.category]].map(([label, fn]) => (
                      <tr key={label}>
                        <td style={{ ...S.td, fontWeight: 700, color: "#777", fontSize: 12 }}>{label}</td>
                        {compareList.map(v => <td key={v.id} style={{ ...S.td, textAlign: "center", fontWeight: 600 }}>{fn(v)}</td>)}
                      </tr>
                    ))}
                    <tr>
                      <td style={S.td} />
                      {compareList.map(v => (
                        <td key={v.id} style={{ ...S.td, textAlign: "center" }}>
                          <button style={{ ...S.btnPrimary, padding: "8px 14px", fontSize: 12 }} onClick={() => { addToCart(v); navTo("order"); }}>Commander</button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ ORDER ══ */}
        {page === "order" && (
          <div style={S.pageWrap}>
            <h1 style={S.pageTitle}>Votre Commande</h1>
            {cart.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>🛒</div>
                <p style={{ color: "#555", marginBottom: 20 }}>Votre panier est vide.</p>
                <button style={S.btnPrimary} onClick={() => navTo("catalogue")}>Voir les véhicules</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 32, alignItems: "start" }}>
                <div>
                  {/* STEPS */}
                  <div style={{ display: "flex", marginBottom: 32, gap: 0 }}>
                    {["Panier", "Livraison", "Paiement"].map((s, i) => (
                      <div key={s} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: orderStep > i ? "#FF6B35" : "#111", border: `2px solid ${orderStep >= i + 1 ? "#FF6B35" : "#333"}`, margin: "0 auto 6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: orderStep > i ? "#fff" : orderStep === i + 1 ? "#FF6B35" : "#444" }}>
                          {orderStep > i ? "✓" : i + 1}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: orderStep === i + 1 ? "#FF6B35" : "#444" }}>{s}</div>
                      </div>
                    ))}
                  </div>

                  {/* STEP 1 */}
                  {orderStep === 1 && (
                    <div>
                      {cart.map(v => (
                        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#111", border: "1px solid #1a1a1a", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                          <div style={{ fontSize: 44 }}>{v.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: 15 }}>{v.name}</div>
                            <div style={{ color: "#777", fontSize: 12 }}>🔋 {v.range_km} km · 💺 {v.seats} pl</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ color: "#FF6B35", fontWeight: 900 }}>{formatPrice(v.price)}</div>
                            <button onClick={() => removeFromCart(v.id)} style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: 12, marginTop: 4 }}>✕ Retirer</button>
                          </div>
                        </div>
                      ))}
                      <button className="hov-btn" style={{ ...S.btnPrimary, width: "100%", marginTop: 14 }} onClick={() => setOrderStep(2)}>Continuer →</button>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {orderStep === 2 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div><label style={S.fl}>Nom complet *</label><input style={S.fi} placeholder="Moussa Diallo" value={orderData.name} onChange={e => setOrderData({ ...orderData, name: e.target.value })} /></div>
                        <div><label style={S.fl}>Téléphone *</label><input style={S.fi} placeholder="+229 97 00 00 00" value={orderData.phone} onChange={e => setOrderData({ ...orderData, phone: e.target.value })} /></div>
                      </div>
                      <div><label style={S.fl}>Email</label><input style={S.fi} type="email" placeholder="email@exemple.com" value={orderData.email} onChange={e => setOrderData({ ...orderData, email: e.target.value })} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div><label style={S.fl}>Ville *</label>
                          <select style={S.fi} value={orderData.city} onChange={e => setOrderData({ ...orderData, city: e.target.value })}>
                            {["Cotonou", "Porto-Novo", "Parakou", "Lomé", "Dakar", "Abidjan", "Ouagadougou", "Lagos"].map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div><label style={S.fl}>Adresse</label><input style={S.fi} placeholder="Quartier, rue..." value={orderData.address} onChange={e => setOrderData({ ...orderData, address: e.target.value })} /></div>
                      </div>
                      <div style={{ display: "flex", gap: 12 }}>
                        <button style={S.btnGhost} onClick={() => setOrderStep(1)}>← Retour</button>
                        <button className="hov-btn" style={{ ...S.btnPrimary, flex: 1 }} onClick={() => { if (!orderData.name || !orderData.phone) { showToast("Nom et téléphone requis", "error"); return; } setOrderStep(3); }}>Continuer →</button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {orderStep === 3 && (
                    <div>
                      <p style={{ fontWeight: 700, marginBottom: 14, color: "#ccc", fontSize: 14 }}>Mode de paiement :</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
                        {PAYMENT_METHODS.map(m => (
                          <button key={m.id} onClick={() => setOrderData({ ...orderData, payment: m.id })}
                            style={{ background: orderData.payment === m.id ? m.color + "22" : "#111", border: `2px solid ${orderData.payment === m.id ? m.color : "#1e1e1e"}`, borderRadius: 12, padding: "16px 10px", cursor: "pointer", textAlign: "center" }}>
                            <div style={{ fontSize: 26, marginBottom: 6 }}>{m.icon}</div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: orderData.payment === m.id ? m.color : "#888" }}>{m.label}</div>
                          </button>
                        ))}
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={S.fl}>Mensualités</label>
                        <select style={S.fi} value={orderData.installments} onChange={e => setOrderData({ ...orderData, installments: parseInt(e.target.value) })}>
                          <option value={1}>Comptant (1 paiement)</option>
                          <option value={3}>3 mensualités</option>
                          <option value={6}>6 mensualités</option>
                          <option value={12}>12 mensualités</option>
                        </select>
                      </div>
                      {orderData.payment === "virement" && (
                        <div style={{ background: "#43A04711", border: "1px solid #43A04733", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
                          🏦 <strong style={{ color: "#43A047" }}>Virement bancaire</strong> : RIB communiqué par notre agent sous 24h.
                        </div>
                      )}
                      {orderData.payment !== "virement" && (
                        <div style={{ background: "#1BC5DD11", border: "1px solid #1BC5DD33", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
                          📱 <strong style={{ color: "#1BC5DD" }}>Mobile Money</strong> : Numéro de compte envoyé par SMS après confirmation.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 12 }}>
                        <button style={S.btnGhost} onClick={() => setOrderStep(2)}>← Retour</button>
                        <button className="hov-btn" style={{ ...S.btnPrimary, flex: 1, opacity: orderLoading ? .7 : 1 }} onClick={submitOrder} disabled={orderLoading}>
                          {orderLoading ? "⏳ Envoi..." : "✓ Confirmer la commande"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* SUMMARY */}
                <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 22, position: "sticky", top: 90 }}>
                  <h3 style={{ fontWeight: 800, marginBottom: 14, fontSize: 15 }}>Récapitulatif</h3>
                  {cart.map(v => (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
                      <span style={{ color: "#aaa" }}>{v.name}</span><span style={{ fontWeight: 700 }}>{formatPrice(v.price)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #1e1e1e", marginTop: 12, paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", marginBottom: 4 }}><span>Livraison</span><span style={{ color: "#00C853" }}>Gratuite</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", marginBottom: 12 }}><span>TVA</span><span style={{ color: "#00C853" }}>Exonérée ✓</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 900 }}>Total</span>
                      <span style={{ fontWeight: 900, color: "#FF6B35", fontSize: 17 }}>{formatPrice(totalCartAmount)}</span>
                    </div>
                    {orderData.installments > 1 && (
                      <div style={{ marginTop: 8, background: "#FF6B3511", border: "1px solid #FF6B3522", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#FF6B35", textAlign: "center" }}>
                        ~{formatPrice(Math.round(totalCartAmount / orderData.installments))}/mois × {orderData.installments}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ SUIVI ══ */}
        {page === "suivi" && (
          <div style={S.pageWrap}>
            <h1 style={S.pageTitle}>Suivi de commande</h1>
            <div style={{ maxWidth: 560 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
                <input style={{ ...S.fi, flex: 1 }} placeholder="Ex: ECO-20260414-ABC123" value={trackingId} onChange={e => setTrackingId(e.target.value)} onKeyDown={e => e.key === "Enter" && lookupOrder()} />
                <button className="hov-btn" style={{ ...S.btnPrimary, flexShrink: 0 }} onClick={lookupOrder} disabled={trackingLoading}>
                  {trackingLoading ? "⏳" : "Rechercher"}
                </button>
              </div>

              {orderSuccess && !trackingData && (
                <div style={{ background: "#00C85311", border: "1px solid #00C85333", borderRadius: 14, padding: 24, marginBottom: 20 }}>
                  <div style={{ fontSize: 42, marginBottom: 10 }}>🎉</div>
                  <h3 style={{ color: "#00C853", fontWeight: 900, marginBottom: 6 }}>Commande confirmée !</h3>
                  <p style={{ color: "#888", fontSize: 13 }}>Référence : <strong style={{ color: "#FFD600" }}>{orderSuccess.id}</strong></p>
                  <p style={{ color: "#888", fontSize: 13, marginTop: 4 }}>Notre équipe vous contacte sous 24h au <strong>{orderSuccess.client_phone}</strong></p>
                </div>
              )}

              {trackingError && <p style={{ color: "#ef4444", marginBottom: 16, fontSize: 14 }}>⚠️ {trackingError}</p>}

              {trackingData && (
                <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <div style={{ color: "#666", fontSize: 12 }}>Référence</div>
                      <div style={{ fontWeight: 900, fontSize: 18, color: "#FFD600" }}>{trackingData.id}</div>
                    </div>
                    <span style={{ background: STATUS_META[trackingData.status]?.color + "22", color: STATUS_META[trackingData.status]?.color, padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 800, height: "fit-content" }}>
                      {STATUS_META[trackingData.status]?.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {(trackingData.order_tracking || []).sort((a, b) => a.step - b.step).map(step => (
                      <div key={step.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: step.done ? "#00C853" : "#1a1a1a", border: `2px solid ${step.done ? "#00C853" : "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, fontSize: 12 }}>
                          {step.done ? "✓" : "·"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: step.done ? "#f0f0f0" : "#444" }}>{step.label}</div>
                          {step.note && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{step.note}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ CONTACT ══ */}
        {page === "contact" && (
          <div style={S.pageWrap}>
            <h1 style={S.pageTitle}>Contact & Devis</h1>
            <p style={{ color: "#666", marginBottom: 28 }}>Réponse garantie sous 24h</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 32, alignItems: "start" }}>
              {quoteSent ? (
                <div style={{ textAlign: "center", background: "#111", border: "1px solid #00C85333", borderRadius: 18, padding: 48 }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                  <h3 style={{ fontWeight: 900, marginBottom: 8 }}>Message envoyé !</h3>
                  <p style={{ color: "#777", marginBottom: 20, fontSize: 14 }}>Nous vous contactons dans les 24h.</p>
                  <button style={S.btnPrimary} onClick={() => { setQuoteSent(false); setQuoteForm({ name: "", phone: "", email: "", message: "", vehicleId: "" }); }}>Nouveau message</button>
                </div>
              ) : (
                <div style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 16, padding: 28 }}>
                  <h3 style={{ fontWeight: 800, marginBottom: 18 }}>Envoyer un message</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div><label style={S.fl}>Nom *</label><input style={S.fi} placeholder="Votre nom" value={quoteForm.name} onChange={e => setQuoteForm({ ...quoteForm, name: e.target.value })} /></div>
                      <div><label style={S.fl}>Téléphone *</label><input style={S.fi} placeholder="+229..." value={quoteForm.phone} onChange={e => setQuoteForm({ ...quoteForm, phone: e.target.value })} /></div>
                    </div>
                    <div><label style={S.fl}>Email</label><input style={S.fi} type="email" value={quoteForm.email} onChange={e => setQuoteForm({ ...quoteForm, email: e.target.value })} /></div>
                    <div>
                      <label style={S.fl}>Modèle (optionnel)</label>
                      <select style={S.fi} value={quoteForm.vehicleId} onChange={e => setQuoteForm({ ...quoteForm, vehicleId: e.target.value })}>
                        <option value="">-- Choisir --</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                    <div><label style={S.fl}>Message *</label><textarea style={{ ...S.fi, height: 110, resize: "vertical" }} placeholder="Vos questions, besoins spécifiques..." value={quoteForm.message} onChange={e => setQuoteForm({ ...quoteForm, message: e.target.value })} /></div>
                    <button className="hov-btn" style={{ ...S.btnPrimary, opacity: quoteLoading ? .7 : 1 }} onClick={submitQuote} disabled={quoteLoading}>
                      {quoteLoading ? "⏳ Envoi..." : "Envoyer ⚡"}
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[["📞", "Téléphone", "+229 01 97 18 61 29"], ["💬", "WhatsApp", "+229 01 97 18 61 29"], ["📍", "Showroom", "Cotonou, Bénin"], ["🕐", "Horaires", "Lun–Sam, 8h–18h"], ["🚚", "Livraison", "Partout en Afrique de l'Ouest"]].map(([ic, l, v]) => (
                  <div key={l} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, background: "#FF6B3522", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{ic}</div>
                    <div><div style={{ color: "#555", fontSize: 10, fontWeight: 700 }}>{l.toUpperCase()}</div><div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{v}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer style={{ background: "#080808", borderTop: "1px solid #111", padding: "48px 24px 28px", marginTop: 60 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 36 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 22 }}>⚡</span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 20, color: "#FFD600" }}>EcoRide</span>
            </div>
            <p style={{ color: "#444", fontSize: 13, lineHeight: 1.7 }}>Mobilité électrique abordable pour l'Afrique de l'Ouest.</p>
          </div>
          {[["Navigation", NAV.map(n => ({ l: n.label, fn: () => navTo(n.id) }))],
            ["Paiement", ["📱 MTN MoMo", "💳 Moov Money", "🌊 Wave", "🏦 Virement"].map(l => ({ l }))],
            ["Contact", ["+229 01 97 18 61 29", "contact@ecoride.africa", "Cotonou, Bénin"].map(l => ({ l }))]].map(([title, items]) => (
            <div key={title}>
              <div style={{ color: "#333", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>{title.toUpperCase()}</div>
              {items.map(item => (
                <div key={item.l} style={{ marginBottom: 6 }}>
                  {item.fn ? <button onClick={item.fn} style={{ background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>{item.l}</button>
                    : <span style={{ color: "#444", fontSize: 13 }}>{item.l}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #111", marginTop: 36, paddingTop: 18, textAlign: "center", color: "#2a2a2a", fontSize: 12 }}>
          © 2026 EcoRide Afrique · Véhicules 100% électriques
        </div>
      </footer>
    </div>
  );
}

// ── LOADER ─────────────────────────────────────────────────
function Loader() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div style={{ width: 36, height: 36, border: "3px solid #1a1a1a", borderTop: "3px solid #FF6B35", borderRadius: "50%", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
      <p style={{ color: "#555", fontSize: 14 }}>Chargement des véhicules...</p>
    </div>
  );
}

// ── VEHICLE CARD ───────────────────────────────────────────
function VCard({ v, onSelect, onCart, inWish, onWish, inCompare, onCompare, chosenColor, onColor }) {
  return (
    <div className="hov-card" style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 16, overflow: "hidden", transition: "all .25s", cursor: "pointer" }}>
      <div style={{ background: `linear-gradient(135deg,${v.colors?.[0] || "#FF6B35"}18,#161616)`, padding: "24px 18px 18px", textAlign: "center", position: "relative", borderBottom: "1px solid #161616" }}>
        {v.badge && <span style={{ position: "absolute", top: 10, left: 10, background: v.badge_color || "#FF6B35", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{v.badge}</span>}
        <button onClick={e => { e.stopPropagation(); onWish(); }} style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", fontSize: 18, cursor: "pointer", color: inWish ? "#FF6B35" : "#333" }}>{inWish ? "♥" : "♡"}</button>
        <div style={{ fontSize: 64, marginBottom: 8 }} onClick={onSelect}>{v.icon || "🚗"}</div>
        {v.colors && v.colors.length > 1 && (
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            {v.colors.map(c => <button key={c} onClick={e => { e.stopPropagation(); onColor(c); }} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: `2px solid ${chosenColor === c || (!chosenColor && c === v.colors[0]) ? "#FFD600" : "transparent"}`, cursor: "pointer" }} />)}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 16px 18px" }}>
        <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 16, marginBottom: 4 }} onClick={onSelect}>{v.name}</h3>
        <p style={{ color: "#666", fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>{(v.description || "").slice(0, 75)}...</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <span style={S.pill}>🔋 {v.range_km}km</span>
          <span style={S.pill}>💺 {v.seats}pl</span>
          {v.ac && <span style={S.pill}>❄️</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <span style={{ fontWeight: 900, color: "#FF6B35", fontSize: 15 }}>{formatPrice(v.price)}</span>
            {v.old_price && <span style={{ fontSize: 11, color: "#333", textDecoration: "line-through", marginLeft: 6 }}>{formatPrice(v.old_price)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={onCart} style={{ ...S.btnPrimary, flex: 1, padding: "8px 0", fontSize: 12 }}>+ Panier</button>
          <button onClick={onSelect} style={{ ...S.btnGhost, padding: "8px 12px", fontSize: 12 }}>Voir</button>
          <button onClick={e => { e.stopPropagation(); onCompare(); }} title="Comparer"
            style={{ padding: "8px 9px", background: inCompare ? "#FFD60022" : "#1a1a1a", border: `1px solid ${inCompare ? "#FFD600" : "#2a2a2a"}`, borderRadius: 7, cursor: "pointer", fontSize: 13 }}>🔄</button>
        </div>
      </div>
    </div>
  );
}

// ── STYLES ─────────────────────────────────────────────────
const S = {
  root: { fontFamily: "'DM Sans',sans-serif", background: "#0a0a0a", minHeight: "100vh", color: "#f0f0f0" },
  toast: { position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "11px 18px", borderRadius: 10, color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 8px 30px rgba(0,0,0,.5)" },
  cartFab: { position: "fixed", bottom: 24, right: 24, zIndex: 999, background: "#FF6B35", border: "none", borderRadius: 50, padding: "13px 16px", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 6px 24px rgba(255,107,53,.5)", display: "flex", alignItems: "center", gap: 6 },
  cartBadge: { background: "#fff", color: "#FF6B35", borderRadius: "50%", width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 },
  nav: { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,.96)", backdropFilter: "blur(14px)", borderBottom: "1px solid #141414" },
  navInner: { maxWidth: 1160, margin: "0 auto", padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 },
  logo: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flexShrink: 0 },
  logoName: { fontFamily: "'Syne',sans-serif", fontWeight: 900, fontSize: 20, color: "#FFD600", letterSpacing: -1, lineHeight: 1 },
  logoSub: { fontSize: 7, color: "#333", letterSpacing: 2 },
  navLinks: { display: "flex", gap: 2, flex: 1, justifyContent: "center" },
  navLink: { background: "none", border: "none", color: "#666", padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, transition: "color .2s", fontFamily: "'DM Sans',sans-serif" },
  navActive: { color: "#FFD600", background: "#FFD60011" },
  navCart: { background: "none", border: "1px solid #1e1e1e", color: "#aaa", padding: "7px 13px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, position: "relative" },
  cartDot: { position: "absolute", top: -5, right: -5, background: "#FF6B35", color: "#fff", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900 },
  burger: { background: "none", border: "1px solid #1e1e1e", color: "#FFD600", padding: "7px 11px", borderRadius: 8, cursor: "pointer", fontSize: 17 },
  mobileMenu: { background: "#0d0d0d", borderTop: "1px solid #141414" },
  mobileLink: { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", color: "#777", padding: "13px 22px", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans',sans-serif" },
  hero: { maxWidth: 1160, margin: "0 auto", padding: "72px 22px 56px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 40, position: "relative", overflow: "hidden", minHeight: 480 },
  orb1: { position: "absolute", width: 460, height: 460, borderRadius: "50%", background: "radial-gradient(circle,#FF6B3520 0%,transparent 70%)", top: -180, left: -80, zIndex: 0, pointerEvents: "none" },
  orb2: { position: "absolute", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle,#FFD60010 0%,transparent 70%)", bottom: -80, right: 0, zIndex: 0, pointerEvents: "none" },
  heroPill: { display: "inline-block", background: "#FF6B3520", color: "#FF6B35", border: "1px solid #FF6B3540", borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 700, marginBottom: 18, letterSpacing: .5 },
  heroTitle: { fontFamily: "'Syne',sans-serif", fontSize: "clamp(2.2rem,4.8vw,3.6rem)", fontWeight: 900, lineHeight: 1.06, margin: "0 0 14px", letterSpacing: -2 },
  heroSub: { color: "#888", fontSize: 15, lineHeight: 1.7, maxWidth: 440, marginBottom: 24 },
  trustBar: { background: "#0d0d0d", borderTop: "1px solid #111", borderBottom: "1px solid #111", padding: "13px 22px", display: "flex", flexWrap: "wrap", gap: "6px 28px", justifyContent: "center" },
  section: { maxWidth: 1160, margin: "0 auto", padding: "56px 22px" },
  sectionTitle: { fontFamily: "'Syne',sans-serif", fontSize: 24, fontWeight: 900, letterSpacing: -1 },
  seeAll: { background: "none", border: "1px solid #222", color: "#aaa", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 18 },
  pageWrap: { maxWidth: 1160, margin: "0 auto", padding: "44px 22px 80px" },
  pageTitle: { fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 900, letterSpacing: -1, marginBottom: 8 },
  backBtn: { background: "#111", border: "1px solid #1e1e1e", color: "#aaa", padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24, fontWeight: 700, fontSize: 13, fontFamily: "'DM Sans',sans-serif" },
  badge: { display: "inline-block", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 },
  pill: { background: "#161616", border: "1px solid #1e1e1e", color: "#777", padding: "4px 10px", borderRadius: 20, fontSize: 11 },
  btnPrimary: { background: "#FF6B35", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 9, fontWeight: 800, fontSize: 14, cursor: "pointer", transition: "all .18s", fontFamily: "'DM Sans',sans-serif" },
  btnOutline: { background: "none", color: "#FF6B35", border: "2px solid #FF6B35", padding: "10px 22px", borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  btnGhost: { background: "#111", color: "#aaa", border: "1px solid #1e1e1e", padding: "10px 16px", borderRadius: 9, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" },
  fl: { color: "#777", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5 },
  fi: { background: "#111", border: "1px solid #1e1e1e", color: "#f0f0f0", padding: "10px 13px", borderRadius: 9, fontSize: 13, width: "100%", fontFamily: "'DM Sans',sans-serif" },
  th: { background: "#0d0d0d", color: "#555", padding: "10px 14px", textAlign: "left", fontWeight: 700, borderBottom: "1px solid #141414", fontSize: 12 },
  td: { padding: "11px 14px", borderBottom: "1px solid #111", color: "#bbb", fontSize: 13 },
};
