-- ── Flat finansal sütunlar (snapshot JSON'ın yerini alır) ──────
-- Supabase SQL Editor'da çalıştırın
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS snapshot jsonb DEFAULT NULL;
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS alis_maliyeti numeric(10,2) DEFAULT NULL;
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS ty_seller_revenue numeric(10,2) DEFAULT NULL;
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS ty_komisyon_tutar numeric(10,2) DEFAULT NULL;
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS ty_kargo numeric(10,2) DEFAULT NULL;

-- Ürünlere Trendyol barcode/SKU alanları ekle
ALTER TABLE stok_kalemleri ADD COLUMN IF NOT EXISTS ty_barcode text DEFAULT NULL;
ALTER TABLE stok_kalemleri ADD COLUMN IF NOT EXISTS ty_merchant_sku text DEFAULT NULL;
ALTER TABLE listingler ADD COLUMN IF NOT EXISTS ty_barcode text DEFAULT NULL;
ALTER TABLE listingler ADD COLUMN IF NOT EXISTS ty_merchant_sku text DEFAULT NULL;
ALTER TABLE setler ADD COLUMN IF NOT EXISTS ty_barcode text DEFAULT NULL;
ALTER TABLE setler ADD COLUMN IF NOT EXISTS ty_merchant_sku text DEFAULT NULL;

-- Satışlara Trendyol sipariş alanları ekle
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS ty_order_id text DEFAULT NULL;
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS ty_order_number text DEFAULT NULL;
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS ty_status text DEFAULT NULL;

-- Trendyol proxy Edge Function dağıtımı (slug: bright-api):
-- supabase login
-- supabase link --project-ref zburwdqwpoxpocymkutk
-- supabase functions deploy trendyol-proxy
