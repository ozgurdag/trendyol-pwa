-- Satışlara snapshot sütunu ekle
-- Supabase SQL Editor'da çalıştırın
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS snapshot jsonb DEFAULT NULL;

-- Trendyol proxy Edge Function dağıtımı:
-- supabase login
-- supabase link --project-ref zburwdqwpoxpocymkutk
-- supabase functions deploy trendyol-proxy
