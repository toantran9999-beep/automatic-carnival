# TODA POS

He thong POS nha hang duoc Viet hoa tu RestAI, dang duoc dieu chinh cho quy trinh van hanh cua TODA.

## Huong MVP

- Nhan vien phuc vu hoac thu ngan tao don truc tiep trong dashboard POS.
- QR khong phai luong khach tu goi mon trong phase 1; neu dung QR thi uu tien cho thanh toan hoac lien ket ban noi bo.
- Thu ngan xu ly thanh toan, in hoa don, va dong ban/phien phuc vu.
- Bep nhan ticket thoi gian thuc tu don hang do nhan vien gui.
- Quan ly ban, khu vuc, nhan vien, menu, kho, thanh toan va bao cao trong dashboard.

## Stack

- **Runtime:** Bun
- **Monorepo:** Turborepo + Bun workspaces
- **API:** Hono + Drizzle ORM + WebSockets
- **Web:** Next.js 16 + TailwindCSS v4 + shadcn/ui
- **DB:** PostgreSQL 17 + Redis 7

## Cau truc

```text
restai/
├── apps/
│   ├── api/          # API REST + WebSocket, port 3001
│   └── web/          # Dashboard + POS, port 3000
├── packages/
│   ├── db/           # Drizzle schema, migrations, seed
│   ├── ui/           # UI components shared
│   ├── validators/   # Zod schemas shared
│   ├── types/        # TypeScript types shared
│   └── config/       # Shared config and permissions
├── docker-compose.yml
└── turbo.json
```

## Yeu cau

- Bun >= 1.3
- Docker, dung cho Redis neu chay local
- PostgreSQL 17 local hoac PostgreSQL service rieng

## Cai dat local

### 1. Cai dependencies

```bash
bun install
```

### 2. Tao file moi truong

```bash
cp .env.example .env
cp .env apps/api/.env
cp .env packages/db/.env
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > apps/web/.env
```

Neu chay PostgreSQL local, chinh `DATABASE_URL` trong `.env`:

```env
DATABASE_URL=postgresql://restai:change-me-in-production@localhost:5432/restai
REDIS_URL=redis://localhost:6379
JWT_SECRET=doi-secret-nay
JWT_REFRESH_SECRET=doi-secret-khac
CORS_ORIGINS=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### 3. Chay Redis

```bash
docker compose up -d
```

### 4. Tao database neu chua co

```bash
createdb restai
```

### 5. Day schema va seed du lieu mau

```bash
bun run db:push
bun run db:seed
```

### 6. Chay dev

```bash
bun run dev
```

| App | URL | Mo ta |
| --- | --- | --- |
| Web | http://localhost:3000 | Dashboard quan ly + POS |
| API | http://localhost:3001 | API REST + WebSocket |

## Scripts

| Lenh | Mo ta |
| --- | --- |
| `bun run dev` | Chay API + Web o che do dev |
| `bun run build` | Build production |
| `bun run db:push` | Day schema hien tai vao database |
| `bun run db:generate` | Tao migration SQL |
| `bun run db:migrate` | Chay migration |
| `bun run db:seed` | Nap du lieu mau TODA |
| `bun run db:studio` | Mo Drizzle Studio |

## Tai khoan seed

Sau khi chay `bun run db:seed`:

| Vai tro | Email | Mat khau |
| --- | --- | --- |
| Admin | `admin@toda.local` | `admin12345` |
| Quan ly | `quanly@toda.local` | `quanly123` |
| Thu ngan | `thungan@toda.local` | `thungan123` |
| Phuc vu | `phucvu@toda.local` | `phucvu123` |
| Bep | `bep@toda.local` | `bep12345` |

## Trang thai hien tai

- Dashboard da co cac module chinh: POS, don hang, ban, bep, menu, kho, nhan vien, thanh toan, loyalty, bao cao, cai dat.
- UI dang duoc Viet hoa thong qua `apps/web/src/lib/translations.ts`.
- POS da co chon ban, tao don, in ticket bep va hop thoai thanh toan nhanh.
- Du lieu mac dinh dang chuyen sang Viet Nam: timezone `Asia/Ho_Chi_Minh`, tien te `VND`, VAT 10%.

## Viec can lam tiep

- Tach ro luong staff-order va customer QR: phase 1 nen an hoac ha uu tien cac man hinh customer self-order.
- Hoan thien POS theo ngu canh: an tai ban, mang ve, giao hang.
- Them luong mo ban, gop/tach/chuyen ban, dong ban sau thanh toan.
- Kiem tra in hoa don thuc te tren Android POS/RawBT hoac print bridge.
- Chuan hoa phuong thuc thanh toan Viet Nam: tien mat, chuyen khoan QR, the, khac.
