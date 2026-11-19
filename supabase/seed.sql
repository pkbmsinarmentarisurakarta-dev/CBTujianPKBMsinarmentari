-- ============================================================================
-- supabase/seed.sql
-- Data contoh awal untuk pengujian sekolah, kelas, mapel, bank soal, dan ujian.
-- ============================================================================

INSERT INTO public.schools (id, npsn, name, level, address, phone, email, principal_name, logo_url, active_academic_year, active_semester)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  '20327981',
  'MA/SMA Nusantara Cendekia',
  'SMA/MA',
  'Jl. Pendidikan No. 45, Surakarta, Jawa Tengah',
  '(0271) 654321',
  'info@nusantaracendekia.sch.id',
  'Drs. H. Ahmad Fauzan, M.Pd.',
  '/images/school-logo.jpg',
  '2026/2027',
  'Ganjil'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.academic_years (id, school_id, year_label, semester, is_active)
VALUES (
  '22222222-2222-4222-8222-222222222221',
  '11111111-1111-4111-8111-111111111111',
  '2026/2027',
  'Ganjil',
  TRUE
) ON CONFLICT DO NOTHING;
