-- ── SUPABASE TABLOLARI ──────────────────────────────────────────
-- Supabase Dashboard → SQL Editor → New Query → Aşağıdakileri yapıştır → Run

-- 1. Şirketler (her hesabın mağazası)
create table if not exists sirketler (
  id         uuid primary key default gen_random_uuid(),
  ad         text not null,
  ortak_kod  text unique not null,
  created_at timestamptz default now()
);

-- 2. Ürünler
create table if not exists urunler (
  id          uuid primary key default gen_random_uuid(),
  sirket_id   uuid references sirketler(id) on delete cascade,
  ad          text not null,
  alis_fiyati numeric(10,2) default 0,
  stok        integer default 0,
  desi        integer default 1,
  komisyon    numeric(5,4) default 0.04,
  kategori    text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 3. Satışlar
create table if not exists satislar (
  id         uuid primary key default gen_random_uuid(),
  sirket_id  uuid references sirketler(id) on delete cascade,
  urun_id    uuid references urunler(id) on delete set null,
  adet       integer not null,
  tarih      date not null,
  created_at timestamptz default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────
-- Herkes kendi şirketinin verisine erişebilir (sirket_id ile)
-- Şimdilik basit tutuyoruz, ileride auth eklenince kısıtlanır

alter table sirketler enable row level security;
alter table urunler    enable row level security;
alter table satislar   enable row level security;

-- Geçici: tüm okuma/yazma izni (auth eklenince kısıtlanır)
create policy "sirketler_herkese_acik" on sirketler for all using (true) with check (true);
create policy "urunler_herkese_acik"   on urunler   for all using (true) with check (true);
create policy "satislar_herkese_acik"  on satislar  for all using (true) with check (true);

-- ── REALTIME ─────────────────────────────────────────────────────
alter publication supabase_realtime add table urunler;
alter publication supabase_realtime add table satislar;

-- ── UPDATED_AT TRİGGERI ──────────────────────────────────────────
create or replace function guncelleme_zamani()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger urunler_updated_at before update on urunler
  for each row execute function guncelleme_zamani();
