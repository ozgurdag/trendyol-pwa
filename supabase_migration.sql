-- Satışlara snapshot sütunu ekle
-- Supabase SQL Editor'da çalıştırın
ALTER TABLE satislar ADD COLUMN IF NOT EXISTS snapshot jsonb DEFAULT NULL;
