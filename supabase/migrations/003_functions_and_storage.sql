-- ============================================================================
-- 003_functions_and_storage.sql
-- Fungsi transaksional ujian & konfigurasi Supabase Storage bucket media soal.
-- ============================================================================

-- Bucket Storage untuk gambar soal & logo sekolah
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cbt-media',
  'cbt-media',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy Storage: Hanya Admin yang terautentikasi dapat upload/hapus media; publik/peserta dapat membaca
CREATE POLICY "cbt_media_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cbt-media');

CREATE POLICY "cbt_media_admin_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cbt-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.is_active = TRUE
    )
  );

CREATE POLICY "cbt_media_admin_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'cbt-media'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id = auth.uid()
        AND p.role = 'ADMIN'
        AND p.is_active = TRUE
    )
  );

-- Fungsi PostgreSQL transaksional untuk upsert jawaban secara idempotent
CREATE OR REPLACE FUNCTION public.upsert_student_answer(
  p_session_id UUID,
  p_question_id UUID,
  p_selected_option_ids_json TEXT,
  p_answer_text TEXT,
  p_is_flagged BOOLEAN,
  p_idempotency_key VARCHAR,
  p_client_seq BIGINT
)
RETURNS TABLE(saved BOOLEAN, server_time TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.exam_sessions;
  v_existing_seq BIGINT;
BEGIN
  SELECT * INTO v_session
  FROM public.exam_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NOW(), 'Sesi ujian tidak ditemukan';
    RETURN;
  END IF;

  IF v_session.status <> 'berlangsung' THEN
    RETURN QUERY SELECT FALSE, NOW(), 'Sesi ujian sudah ditutup';
    RETURN;
  END IF;

  IF NOW() > v_session.expires_at THEN
    UPDATE public.exam_sessions
    SET status = 'waktu_habis', submitted_at = NOW(), connection_status = 'selesai'
    WHERE id = p_session_id;
    RETURN QUERY SELECT FALSE, NOW(), 'Waktu ujian telah habis';
    RETURN;
  END IF;

  SELECT client_seq INTO v_existing_seq
  FROM public.student_answers
  WHERE session_id = p_session_id AND question_id = p_question_id;

  IF v_existing_seq IS NOT NULL AND p_client_seq < v_existing_seq THEN
    RETURN QUERY SELECT TRUE, NOW(), 'Urutan lebih lama diabaikan (idempotent)';
    RETURN;
  END IF;

  INSERT INTO public.student_answers (
    session_id, question_id, selected_option_ids_json, answer_text,
    is_flagged, idempotency_key, client_seq, updated_at
  ) VALUES (
    p_session_id, p_question_id, p_selected_option_ids_json, p_answer_text,
    p_is_flagged, p_idempotency_key, p_client_seq, NOW()
  )
  ON CONFLICT (session_id, question_id)
  DO UPDATE SET
    selected_option_ids_json = EXCLUDED.selected_option_ids_json,
    answer_text = EXCLUDED.answer_text,
    is_flagged = EXCLUDED.is_flagged,
    idempotency_key = EXCLUDED.idempotency_key,
    client_seq = EXCLUDED.client_seq,
    updated_at = NOW();

  RETURN QUERY SELECT TRUE, NOW(), 'Tersimpan';
END;
$$;
