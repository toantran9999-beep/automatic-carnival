// toda-app.jsx — CartPanel, App root, render

const { useState: useS, useMemo, useEffect: useE } = React;

// ---------- Cart panel ----------
function CartPanel({ mode, setMode, table, setTable, customer, setCustomer,
                     cart, setQty, removeLine, total, sub, discount, onSend }) {
  const count = cart.reduce((n, l) => n + l.qty, 0);
  return (
    <aside className="cart">
      <div className="cart-head">
        <span className="ch-title"><Icons.cart size={20} stroke="var(--accent)" /> Đơn hàng POS</span>
        {count > 0 && <span className="ch-count">{count} món</span>}
      </div>

      <div className="seg">
        <button className={mode === "dine" ? "on" : ""} onClick={() => setMode("dine")}>
          <Icons.table size={16} /> Ăn tại bàn
        </button>
        <button className={mode === "take" ? "on" : ""} onClick={() => setMode("take")}>
          <Icons.bag size={16} /> Mang về
        </button>
      </div>

      {mode === "dine" && (
        <div className="field">
          <Icons.table size={15} />
          <select className="select" value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">Chọn bàn ăn...</option>
            {TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="field-chev"><Icons.chevron size={15} /></span>
        </div>
      )}

      <div className="field">
        <Icons.user size={15} />
        <input className="input bare" placeholder="Tên khách hàng..." value={customer}
               onChange={(e) => setCustomer(e.target.value)} />
      </div>

      {cart.length === 0 ? (
        <div className="cart-empty">
          <Icons.cart size={56} stroke="var(--text-faint)" sw={1.2} />
          <p>Giỏ hàng trống</p>
          <span>Chọn món ở bên trái để thêm vào đơn</span>
        </div>
      ) : (
        <div className="cart-list">
          {cart.map((l) => (
            <div className="line" key={l.lineId}>
              <div className="line-emblem"><TodaMark size={26} stroke="var(--accent)" /></div>
              <div className="line-info">
                <div className="line-name">{l.name}</div>
                {l.optLabel && <div className="line-opt">{l.optLabel}</div>}
                {l.note && <div className="line-note">“{l.note}”</div>}
                <div className="line-price">{fmtVND(l.unit)}</div>
              </div>
              <div className="line-right">
                <button className="line-del" onClick={() => removeLine(l.lineId)}><Icons.trash size={15} /></button>
                <div className="qty">
                  <button onClick={() => setQty(l.lineId, l.qty - 1)}><Icons.minus size={14} /></button>
                  <span>{l.qty}</span>
                  <button onClick={() => setQty(l.lineId, l.qty + 1)}><Icons.plus size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && (
        <div className="totals">
          <div className="trow"><span>Tạm tính</span><span>{fmtVND(sub)}</span></div>
          {discount > 0 && <div className="trow disc"><span>Giảm giá (5%)</span><span>-{fmtVND(discount)}</span></div>}
          <div className="trow grand"><span>Tổng cộng</span><span>{fmtVND(total)}</span></div>
        </div>
      )}

      <button className={"sendbtn" + (cart.length ? "" : " disabled")} disabled={!cart.length} onClick={onSend}>
        <Icons.check size={19} /> Gửi Đơn hàng {cart.length > 0 && "· " + fmtVND(total)}
      </button>
    </aside>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#7aa653",
  "cardStyle": "regular",
  "loyalty": true
}/*EDITMODE-END*/;

// matcha (logo) · vàng Đông Dương / vàng chùa · terracotta gạch · xanh ngọc
const ACCENTS = ["#7aa653", "#c79a2e", "#b06b4e", "#5a9d8c"];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = useS("pos");
  const [collapsed, setCollapsed] = useS(false);
  const [lang, setLang] = useS("vi");
  const [cat, setCat] = useS("all");
  const [q, setQ] = useS("");
  const [picking, setPicking] = useS(null);
  const [cart, setCart] = useS([]);
  const [mode, setMode] = useS("dine");
  const [table, setTable] = useS("");
  const [customer, setCustomer] = useS("");
  const [toast, setToast] = useS("");

  // apply theme + accent to root
  useE(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", t.theme);
    r.style.setProperty("--accent", t.accent);
  }, [t.theme, t.accent]);

  const items = useMemo(() => MENU.filter((m) => {
    const okCat = cat === "all" || m.cat === cat;
    const okQ = !q || m.name.toLowerCase().includes(q.toLowerCase());
    return okCat && okQ;
  }), [cat, q]);

  const counts = useMemo(() => {
    const c = { all: MENU.length };
    MENU.forEach((m) => (c[m.cat] = (c[m.cat] || 0) + 1));
    return c;
  }, []);

  const addToCart = (line) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.lineId === line.lineId);
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + line.qty }; return n; }
      return [...prev, line];
    });
    flash("Đã thêm “" + line.name + "” vào đơn");
  };
  const setQty = (lineId, qty) => {
    if (qty <= 0) return removeLine(lineId);
    setCart((p) => p.map((l) => (l.lineId === lineId ? { ...l, qty } : l)));
  };
  const removeLine = (lineId) => setCart((p) => p.filter((l) => l.lineId !== lineId));

  const sub = cart.reduce((s, l) => s + l.unit * l.qty, 0);
  const discount = t.loyalty && customer.trim() ? Math.round(sub * 0.05) : 0;
  const total = sub - discount;

  let toastTimer = null;
  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(""), 2200);
  }

  const onSend = () => {
    if (!cart.length) return;
    const where = mode === "dine" ? (table || "chưa chọn bàn") : "Mang về";
    flash("Đã gửi đơn " + fmtVND(total) + " · " + where);
    setCart([]); setCustomer(""); setTable("");
  };

  const pickItem = (item) => {
    if (!item.opts || item.opts.length === 0) {
      addToCart({ ...item, unit: item.price, qty: 1, optLabel: "", note: "",
                  lineId: item.id + "||" });
    } else setPicking(item);
  };

  const navLabel = NAV.flatMap((g) => g.items).find((i) => i.id === active)?.label || "";
  const openTable = (tb) => {
    const label = tb.id.startsWith("VIP") ? "Bàn VIP " + tb.id.slice(3) : "Bàn " + tb.id.slice(1);
    setMode("dine"); setTable(label); setActive("pos");
    flash((tb.status === "empty" ? "Mở " : "Tiếp tục ") + label);
  };

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive} collapsed={collapsed} setCollapsed={setCollapsed} />

      <div className="center">
        <TopBar lang={lang} setLang={setLang} />

        {active === "pos" && (
        <main className="main">
          <div className="page-head">
            <div>
              <h1>POS (Bán hàng)</h1>
              <p>Chọn món để tạo đơn hàng mới</p>
            </div>
            <div className="head-clock"><Icons.clock size={16} /> <ClockNow /></div>
          </div>

          <div className="searchbar">
            <Icons.search size={18} stroke="var(--text-dim)" />
            <input placeholder="Tìm món ăn, đồ uống..." value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="search-clear" onClick={() => setQ("")}><Icons.x size={15} /></button>}
          </div>

          <div className="cats">
            {CATS.map((c) => (
              <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}>
                {c.label}
                <span className="cat-count">{counts[c.id] || 0}</span>
              </button>
            ))}
          </div>

          <div className="grid-wrap">
            <ProductGrid items={items} cardStyle={t.cardStyle} onPick={pickItem} />
          </div>
        </main>
        )}
        {active === "tables" && <TablesScreen onOpenTable={openTable} />}
        {active !== "pos" && active !== "tables" && <StubScreen label={navLabel} />}
      </div>

      {active === "pos" && (
      <CartPanel mode={mode} setMode={setMode} table={table} setTable={setTable}
                 customer={customer} setCustomer={setCustomer} cart={cart}
                 setQty={setQty} removeLine={removeLine} total={total} sub={sub}
                 discount={discount} onSend={onSend} />
      )}

      {picking && <CustomizeModal item={picking} onClose={() => setPicking(null)} onAdd={addToCart} />}
      <Toast msg={toast} />

      <TweaksPanel>
        <TweakSection label="Giao diện" />
        <TweakRadio label="Nền" value={t.theme} options={["dark", "light"]}
                    onChange={(v) => setTweak("theme", v)} />
        <TweakColor label="Điểm nhấn" value={t.accent} options={ACCENTS}
                    onChange={(v) => setTweak("accent", v)} />
        <TweakRadio label="Kiểu thẻ món" value={t.cardStyle} options={["compact", "regular"]}
                    onChange={(v) => setTweak("cardStyle", v)} />
        <TweakSection label="Nghiệp vụ" />
        <TweakToggle label="Giảm 5% khách thân thiết" value={t.loyalty}
                     onChange={(v) => setTweak("loyalty", v)} />
      </TweaksPanel>
    </div>
  );
}

function ClockNow() {
  const [now, setNow] = useS(new Date());
  useE(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const p = (n) => String(n).padStart(2, "0");
  return <span>{p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}</span>;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
