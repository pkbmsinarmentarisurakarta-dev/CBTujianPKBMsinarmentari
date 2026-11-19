-- ============================================================================
-- 002_rls_policies.sql
-- Kebijakan Row Level Security (RLS) untuk seluruh 17 tabel CBT Online.
-- Catatan: Backend server menggunakan SUPABASE_SERVICE_ROLE_KEY hanya untuk
-- operasi terkontrol setelah memverifikasi identitas & kewenangan pengguna.
-- ============================================================================

-- Fungsi helper otorisasi berbasis auth.uid()
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(target_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.role = 'ADMIN'
      AND p.is_active = TRUE
      AND p.school_id = target_school_id
  );
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = TRUE
  LIMIT 1;
$$;

-- Aktifkan RLS pada semua 17 tabel
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. schools: Admin dapat mengelola sekolahnya; Siswa hanya membaca sekolahnya.
CREATE POLICY schools_select_member ON public.schools
  FOR SELECT USING (
    id = (SELECT school_id FROM public.current_profile())
  );
CREATE POLICY schools_update_admin ON public.schools
  FOR UPDATE USING (public.is_school_admin(id))
  WITH CHECK (public.is_school_admin(id));

-- 2. profiles: Admin mengelola profil sekolahnya; Siswa hanya membaca profilnya sendiri.
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (
    auth_user_id = auth.uid() OR public.is_school_admin(school_id)
  );
CREATE POLICY profiles_admin_write ON public.profiles
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 3. academic_years
CREATE POLICY academic_years_select_school ON public.academic_years
  FOR SELECT USING (school_id = (SELECT school_id FROM public.current_profile()));
CREATE POLICY academic_years_admin_write ON public.academic_years
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 4. classes
CREATE POLICY classes_select_school ON public.classes
  FOR SELECT USING (school_id = (SELECT school_id FROM public.current_profile()));
CREATE POLICY classes_admin_write ON public.classes
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 5. students: Admin kelola sekolahnya; Siswa hanya lihat datanya sendiri.
CREATE POLICY students_select_self_or_admin ON public.students
  FOR SELECT USING (
    id = public.current_student_id() OR public.is_school_admin(school_id)
  );
CREATE POLICY students_admin_write ON public.students
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 6. subjects
CREATE POLICY subjects_select_school ON public.subjects
  FOR SELECT USING (school_id = (SELECT school_id FROM public.current_profile()));
CREATE POLICY subjects_admin_write ON public.subjects
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 7. question_banks (Hanya ADMIN - siswa dilarang mengakses bank soal!)
CREATE POLICY qbanks_admin_only ON public.question_banks
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 8. questions (Hanya ADMIN dapat membaca/menulis kunci jawaban & bank soal langsung)
CREATE POLICY questions_admin_only ON public.questions
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 9. question_options (Hanya ADMIN - mengandung flag is_correct!)
CREATE POLICY qoptions_admin_only ON public.question_options
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_options.question_id
        AND public.is_school_admin(q.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.questions q
      WHERE q.id = question_options.question_id
        AND public.is_school_admin(q.school_id)
    )
  );

-- 10. exams: Admin kelola semua ujian sekolah; Siswa hanya lihat ujian yang ia ikuti.
CREATE POLICY exams_select_participant_or_admin ON public.exams
  FOR SELECT USING (
    public.is_school_admin(school_id)
    OR EXISTS (
      SELECT 1 FROM public.exam_participants ep
      WHERE ep.exam_id = exams.id
        AND ep.student_id = public.current_student_id()
    )
  );
CREATE POLICY exams_admin_write ON public.exams
  FOR ALL USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_school_admin(school_id));

-- 11. exam_participants
CREATE POLICY eparticipants_select_own_or_admin ON public.exam_participants
  FOR SELECT USING (
    student_id = public.current_student_id()
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_participants.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );
CREATE POLICY eparticipants_admin_write ON public.exam_participants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_participants.exam_id
        AND public.is_school_admin(e.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_participants.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );

-- 12. exam_questions (Hanya ADMIN; delivery soal siswa melalui RPC/API yang menyembunyikan kunci)
CREATE POLICY equestions_admin_only ON public.exam_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_questions.exam_id
        AND public.is_school_admin(e.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_questions.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );

-- 13. exam_sessions: Siswa hanya membaca sesinya sendiri; mutasi sesi via backend/RPC.
CREATE POLICY esessions_select_own_or_admin ON public.exam_sessions
  FOR SELECT USING (
    student_id = public.current_student_id()
    OR EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sessions.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );
CREATE POLICY esessions_admin_write ON public.exam_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sessions.exam_id
        AND public.is_school_admin(e.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_sessions.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );

-- 14. student_answers: Siswa hanya membaca & menyimpan jawaban pada sesi miliknya yang masih berlangsung.
CREATE POLICY sanswers_select_own_or_admin ON public.student_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions es
      WHERE es.id = student_answers.session_id
        AND es.student_id = public.current_student_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.exam_sessions es
      JOIN public.exams e ON e.id = es.exam_id
      WHERE es.id = student_answers.session_id
        AND public.is_school_admin(e.school_id)
    )
  );

CREATE POLICY sanswers_student_upsert_active ON public.student_answers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_sessions es
      WHERE es.id = student_answers.session_id
        AND es.student_id = public.current_student_id()
        AND es.status = 'berlangsung'
        AND NOW() <= es.expires_at
    )
  );

CREATE POLICY sanswers_student_update_active ON public.student_answers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.exam_sessions es
      WHERE es.id = student_answers.session_id
        AND es.student_id = public.current_student_id()
        AND es.status = 'berlangsung'
        AND NOW() <= es.expires_at
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exam_sessions es
      WHERE es.id = student_answers.session_id
        AND es.student_id = public.current_student_id()
        AND es.status = 'berlangsung'
        AND NOW() <= es.expires_at
    )
  );

-- 15. exam_activity_logs
CREATE POLICY eactivity_select_admin ON public.exam_activity_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_activity_logs.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );
CREATE POLICY eactivity_insert_own ON public.exam_activity_logs
  FOR INSERT WITH CHECK (student_id = public.current_student_id());

-- 16. exam_results: Siswa HANYA bisa melihat hasil jika results_published = TRUE! Tidak bisa mengubah nilai!
CREATE POLICY eresults_select_published_or_admin ON public.exam_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_results.exam_id
        AND public.is_school_admin(e.school_id)
    )
    OR (
      student_id = public.current_student_id()
      AND EXISTS (
        SELECT 1 FROM public.exams e
        WHERE e.id = exam_results.exam_id
          AND e.results_published = TRUE
      )
    )
  );
CREATE POLICY eresults_admin_write ON public.exam_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_results.exam_id
        AND public.is_school_admin(e.school_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_results.exam_id
        AND public.is_school_admin(e.school_id)
    )
  );

-- 17. audit_logs: Hanya Admin sekolah terkait.
CREATE POLICY audit_logs_admin_select ON public.audit_logs
  FOR SELECT USING (public.is_school_admin(school_id));
