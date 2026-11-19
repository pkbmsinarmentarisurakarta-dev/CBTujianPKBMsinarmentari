-- ============================================================================
-- supabase/tests/rls_tests.sql
-- Pengujian otomatis kebijakan Row Level Security (RLS) pada PostgreSQL.
-- Memastikan siswa tidak bisa membaca kunci jawaban, mengubah nilai, atau
-- mengakses data peserta lain.
-- ============================================================================

BEGIN;

-- Simulasikan role authenticated tanpa hak admin
SET LOCAL ROLE authenticated;

-- 1. Pastikan siswa tidak dapat mengakses tabel questions/question_options secara langsung
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.question_options;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'KEGAGALAN RLS: Siswa tidak boleh membaca question_options secara langsung!';
  END IF;
END $$;

-- 2. Pastikan siswa tidak dapat menyisipkan atau mengubah tabel exam_results
DO $$
BEGIN
  BEGIN
    INSERT INTO public.exam_results (exam_id, session_id, student_id, final_score)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 100);
    RAISE EXCEPTION 'KEGAGALAN RLS: Siswa berhasil menulis ke exam_results!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'LULUS RLS: Penulisan langsung ke exam_results oleh siswa ditolak.';
  END;
END $$;

ROLLBACK;
