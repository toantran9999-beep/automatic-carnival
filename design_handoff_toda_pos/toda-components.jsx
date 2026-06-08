// toda-components.jsx — Sidebar, TopBar, ProductCard, Grid, CartPanel, CustomizeModal, Toast

const { useState, useEffect, useRef } = React;

// ---------- Sidebar ----------
function Sidebar({ active, setActive, collapsed, setCollapsed }) {
  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
      <div className="sb-head">
        <div className="sb-logo"><TodaMark size={30} stroke="var(--accent)" /></div>
        {!collapsed && (
          <div className="sb-brand">
            <div className="sb-title">TODA POS</div>
            <div className="sb-sub">Quản lý nhà hàng</div>
          </div>
        )}
        <button className="sb-collapse" onClick={() => setCollapsed(!collapsed)} title="Thu gọn">
          {collapsed ? <Icons.chevron size={16} /> : <Icons.chevronL size={16} />}
        </button>
      </div>

      <div className="branch">
        <Icons.branch size={16} />
        {!collapsed && <span>Chi Nhánh Chính</span>}
      </div>

      <nav className="nav">
        {NAV.map((g) => (
          <div className="nav-group" key={g.group}>
            {!collapsed && <div className="nav-glabel">{g.group}</div>}
            {g.items.map((it) => {
              const Ico = Icons[it.icon];
              const on = active === it.id;
              return (
                <button key={it.id} className={"nav-item" + (on ? " active" : "")}
                        onClick={() => setActive(it.id)} title={it.label}>
                  <span className="nav-ico"><Ico size={19} /></span>
                  {!collapsed && <span className="nav-text">{it.label}</span>}
                  {!collapsed && it.badge && <span className="nav-badge">{it.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-user">
          <div className="avatar">QT</div>
          {!collapsed && (
            <div className="sb-userinfo">
              <div className="u-name">Quản Trị Viên</div>
              <div className="u-role">Quản trị viên</div>
            </div>
          )}
        </div>
        {!collapsed && <button className="sb-logout" title="Đăng xuất"><Icons.logout size={18} /></button>}
      </div>
    </aside>
  );
}

// ---------- Top bar ----------
function TopBar({ lang, setLang }) {
  return (
    <header className="topbar">
      <div className="tb-spacer" />
      <div className="lang-seg">
        <button className={lang === "vi" ? "on" : ""} onClick={() => setLang("vi")}>VI</button>
        <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
      </div>
      <button className="tb-chip"><Icons.branch size={15} /><span>Chi Nhánh Chính</span></button>
      <button className="tb-icon"><Icons.bell size={18} /><span className="dot" /></button>
      <div className="tb-user">
        <div className="avatar sm">QT</div>
        <span>Quản Trị Viên</span>
      </div>
    </header>
  );
}

// ---------- Product card ----------
function ProductCard({ item, cardStyle, onPick }) {
  const tone = CAT_TONE[item.cat] || CAT_TONE.coffee;
  const bg = `radial-gradient(120% 90% at 50% 18%, oklch(0.30 ${tone.c} ${tone.h}) 0%, oklch(0.20 ${tone.c} ${tone.h}) 60%, oklch(0.16 ${tone.c} ${tone.h}) 100%)`;
  return (
    <button className="card" onClick={() => onPick(item)}>
      <div className="card-img" style={{ background: bg }}>
        {item.hot && <span className="hot">NÓNG / ĐÁ</span>}
        <div className="card-emblem">
          <TodaMark size={cardStyle === "compact" ? 46 : 58} stroke="oklch(0.82 0.02 95 / 0.55)" />
          <div className="emblem-word">Toda Café</div>
        </div>
        <span className="cat-tag">{tone.name}</span>
      </div>
      <div className="card-foot">
        <div className="card-name">{item.name}</div>
        <div className="card-price">{fmtVND(item.price)}</div>
      </div>
    </button>
  );
}

// ---------- Product grid ----------
function ProductGrid({ items, cardStyle, onPick }) {
  if (!items.length) {
    return <div className="grid-empty"><Icons.search size={34} stroke="var(--text-dim)" /><p>Không tìm thấy món phù hợp</p></div>;
  }
  return (
    <div className={"grid " + cardStyle}>
      {items.map((it) => <ProductCard key={it.id} item={it} cardStyle={cardStyle} onPick={onPick} />)}
    </div>
  );
}

// ---------- Customize modal ----------
function CustomizeModal({ item, onClose, onAdd }) {
  const groups = (item.opts || []).map((k) => ({ k, ...OPT_GROUPS[k] }));
  const [sel, setSel] = useState(() => {
    const s = {}; groups.forEach((g) => (s[g.k] = g.def)); return s;
  });
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  const addPrice = groups.reduce((sum, g) => {
    const c = g.choices.find((c) => c.k === sel[g.k]); return sum + (c ? c.add : 0);
  }, 0);
  const unit = item.price + addPrice;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const confirm = () => {
    const optLabel = groups.map((g) => sel[g.k]).join(" · ");
    onAdd({ ...item, unit, qty, optLabel, note: note.trim(),
            lineId: item.id + "|" + groups.map((g) => sel[g.k]).join("|") + "|" + note.trim() });
    onClose();
  };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="mh-emblem"><TodaMark size={34} stroke="var(--accent)" /></div>
          <div className="mh-info">
            <div className="mh-name">{item.name}</div>
            <div className="mh-base">{fmtVND(item.price)}</div>
          </div>
          <button className="mh-close" onClick={onClose}><Icons.x size={18} /></button>
        </div>

        <div className="modal-body">
          {groups.length === 0 && (
            <div className="no-opts"><Icons.check size={18} stroke="var(--accent)" /> Món này không cần tuỳ chọn thêm.</div>
          )}
          {groups.map((g) => (
            <div className="opt-group" key={g.k}>
              <div className="opt-label">{g.label}</div>
              <div className="opt-choices">
                {g.choices.map((c) => (
                  <button key={c.k}
                          className={"chip" + (sel[g.k] === c.k ? " on" : "")}
                          onClick={() => setSel({ ...sel, [g.k]: c.k })}>
                    {c.k}{c.add > 0 && <span className="chip-add">+{fmtVND(c.add)}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="opt-group">
            <div className="opt-label"><Icons.note size={15} /> Ghi chú</div>
            <input className="input" placeholder="Ví dụ: ít ngọt, không hành..." value={note}
                   onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="modal-foot">
          <div className="stepper">
            <button onClick={() => setQty(Math.max(1, qty - 1))}><Icons.minus size={16} /></button>
            <span>{qty}</span>
            <button onClick={() => setQty(qty + 1)}><Icons.plus size={16} /></button>
          </div>
          <button className="add-btn" onClick={confirm}>
            <Icons.plus size={17} /> Thêm · {fmtVND(unit * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Toast ----------
function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast"><Icons.check size={17} stroke="#fff" /> {msg}</div>;
}

Object.assign(window, { Sidebar, TopBar, ProductCard, ProductGrid, CustomizeModal, Toast });
