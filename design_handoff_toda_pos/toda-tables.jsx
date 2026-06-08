// toda-tables.jsx — Bàn ăn (floor view) + stub screen for unbuilt sections

const { useState: useTS } = React;

// status: empty | serving | reserved | bill
const FLOOR = [
  { area: "Tầng 1 — Trong nhà", tables: [
    { id: "B01", cap: 4, status: "serving",  guests: 3, mins: 24, bill: 124000, server: "Lan" },
    { id: "B02", cap: 2, status: "empty" },
    { id: "B03", cap: 4, status: "serving",  guests: 4, mins: 52, bill: 286000, server: "Lan" },
    { id: "B04", cap: 4, status: "bill",     guests: 2, mins: 68, bill: 95000,  server: "Tú" },
    { id: "B05", cap: 6, status: "reserved", name: "A. Phong", at: "19:30" },
    { id: "B06", cap: 2, status: "empty" },
  ]},
  { area: "Sân vườn", tables: [
    { id: "B07", cap: 4, status: "serving",  guests: 2, mins: 12, bill: 58000,  server: "Tú" },
    { id: "B08", cap: 4, status: "empty" },
    { id: "B09", cap: 8, status: "serving",  guests: 6, mins: 38, bill: 412000, server: "Hà" },
    { id: "B10", cap: 2, status: "reserved", name: "C. Mai", at: "20:00" },
  ]},
  { area: "Phòng VIP", tables: [
    { id: "VIP1", cap: 10, status: "serving", guests: 8, mins: 75, bill: 940000, server: "Hà" },
    { id: "VIP2", cap: 10, status: "empty" },
  ]},
];

const ST = {
  empty:    { label: "Trống",         color: "var(--text-dim)" },
  serving:  { label: "Đang phục vụ",  color: "var(--accent)" },
  reserved: { label: "Đặt trước",     color: "#d8a23a" },
  bill:     { label: "Xin tính tiền", color: "#e0795a" },
};

function ChairRow({ cap }) {
  return (
    <span className="chairs" title={cap + " chỗ"}>
      <Icons.staff size={14} stroke="var(--text-dim)" /> {cap} chỗ
    </span>
  );
}

function TablesScreen({ onOpenTable }) {
  const [filter, setFilter] = useTS("all");
  const all = FLOOR.flatMap((z) => z.tables);
  const stat = {
    empty: all.filter((t) => t.status === "empty").length,
    serving: all.filter((t) => t.status === "serving").length,
    reserved: all.filter((t) => t.status === "reserved").length,
    bill: all.filter((t) => t.status === "bill").length,
  };

  const show = (t) => filter === "all" || t.status === filter
    || (filter === "serving" && t.status === "bill");

  return (
    <main className="main tables">
      <div className="page-head">
        <div>
          <h1>Bàn ăn</h1>
          <p>Sơ đồ bàn theo khu vực · chạm vào bàn để mở đơn</p>
        </div>
        <div className="floor-stats">
          <span><b style={{color:"var(--accent)"}}>{stat.serving}</b> đang phục vụ</span>
          <span><b style={{color:"#d8a23a"}}>{stat.reserved}</b> đặt trước</span>
          <span><b>{stat.empty}</b> trống</span>
        </div>
      </div>

      <div className="cats">
        {[["all","Tất cả"],["empty","Trống"],["serving","Đang phục vụ"],["reserved","Đặt trước"]].map(([k,l]) => (
          <button key={k} className={"cat-chip" + (filter===k?" on":"")} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="tables-wrap">
        {FLOOR.map((zone) => {
          const visible = zone.tables.filter(show);
          if (!visible.length) return null;
          return (
            <div className="zone" key={zone.area}>
              <div className="zone-title">{zone.area}</div>
              <div className="tbl-grid">
                {visible.map((t) => {
                  const s = ST[t.status];
                  return (
                    <button key={t.id} className={"tbl-card " + t.status} onClick={() => onOpenTable(t)}
                            style={{ "--st": s.color }}>
                      <div className="tbl-top">
                        <span className="tbl-name">{t.id}</span>
                        <span className="tbl-badge"><i className="dot" /> {s.label}</span>
                      </div>

                      {t.status === "empty" && (
                        <div className="tbl-mid empty"><ChairRow cap={t.cap} /></div>
                      )}
                      {(t.status === "serving" || t.status === "bill") && (
                        <div className="tbl-mid">
                          <div className="tbl-row"><Icons.user size={14} stroke="var(--text-dim)" /> {t.guests} khách · {t.cap} chỗ</div>
                          <div className="tbl-row"><Icons.clock size={14} stroke="var(--text-dim)" /> {t.mins} phút · NV {t.server}</div>
                        </div>
                      )}
                      {t.status === "reserved" && (
                        <div className="tbl-mid">
                          <div className="tbl-row"><Icons.user size={14} stroke="var(--text-dim)" /> {t.name}</div>
                          <div className="tbl-row"><Icons.clock size={14} stroke="var(--text-dim)" /> Giữ lúc {t.at} · {t.cap} chỗ</div>
                        </div>
                      )}

                      <div className="tbl-foot">
                        {t.status === "empty" && <span className="tbl-cta">+ Mở bàn</span>}
                        {(t.status === "serving" || t.status === "bill") && <span className="tbl-bill">{fmtVND(t.bill)}</span>}
                        {t.status === "reserved" && <span className="tbl-cta">Nhận bàn</span>}
                        {t.status === "bill" && <span className="tbl-cta warn">Tính tiền →</span>}
                        {t.status === "serving" && <span className="tbl-cta">Gọi thêm →</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function StubScreen({ label }) {
  return (
    <main className="main stub">
      <div className="stub-card">
        <div className="stub-emblem"><TodaMark size={52} stroke="var(--accent)" /></div>
        <h2>{label}</h2>
        <p>Màn hình này đang được hoàn thiện trong cùng hệ thiết kế.<br/>Cho tao biết nếu mày muốn dựng tiếp phần này.</p>
        <div className="stub-tag">TODA POS · đang phát triển</div>
      </div>
    </main>
  );
}

Object.assign(window, { TablesScreen, StubScreen });
