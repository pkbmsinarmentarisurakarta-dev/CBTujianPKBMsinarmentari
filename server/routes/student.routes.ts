import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { db, uid } from '../db/sqlite.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { gradeSession } from '../services/grading.service.ts';
import { broadcastMonitoringEvent } from '../services/ws.service.ts';
import { writeAuditLog } from '../utils/audit.ts';

const router = Router();
router.use(requireAuth, requireRole('SISWA'));

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ======================== DASHBOARD SISWA ========================
router.get('/dashboard', (req: Request, res: Response) => {
  const studentId = req.authUser!.studentId;
  if (!studentId) return res.status(403).json({ error: 'Profil siswa tidak valid.' });

  const student = db.prepare(`
    SELECT s.*, c.name AS class_name, sc.name AS school_name, sc.logo_url AS school_logo,
           sc.active_academic_year, sc.active_semester
    FROM students s
    JOIN schools sc ON sc.id = s.school_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.id = ?
  `).get(studentId);

  const exams = db.prepare(`
    SELECT e.id, e.title, e.exam_type, e.description, e.exam_date, e.start_time, e.end_time,
           e.duration_minutes, e.question_count, e.passing_score, e.max_attempts,
           e.questions_per_page, e.results_published, e.status AS exam_status,
           sub.name AS subject_name, sub.code AS subject_code,
           ep.extra_minutes, ep.allowed_attempts, ep.status AS participant_status,
           (SELECT COUNT(*) FROM exam_sessions es WHERE es.exam_id = e.id AND es.student_id = ? AND es.status IN ('selesai', 'waktu_habis')) AS completed_attempts,
           (SELECT id FROM exam_sessions es WHERE es.exam_id = e.id AND es.student_id = ? AND es.status = 'berlangsung' LIMIT 1) AS active_session_id,
           (SELECT id FROM exam_sessions es WHERE es.exam_id = e.id AND es.student_id = ? AND es.status IN ('selesai', 'waktu_habis') ORDER BY attempt_number DESC LIMIT 1) AS last_completed_session_id
    FROM exam_participants ep
    JOIN exams e ON e.id = ep.exam_id
    JOIN subjects sub ON sub.id = e.subject_id
    WHERE ep.student_id = ? AND e.status IN ('terjadwal', 'aktif', 'selesai')
    ORDER BY e.exam_date DESC, e.start_time ASC
  `).all(studentId, studentId, studentId, studentId) as any[];

  // Ambil hasil HANYA untuk ujian yang results_published = 1
  const publishedResults = db.prepare(`
    SELECT er.id, er.exam_id, er.session_id, er.final_score, er.correct_count, er.wrong_count,
           er.unanswered_count, er.needs_manual_grading, er.published_at,
           e.title AS exam_title, e.passing_score, sub.name AS subject_name
    FROM exam_results er
    JOIN exams e ON e.id = er.exam_id
    JOIN subjects sub ON sub.id = e.subject_id
    WHERE er.student_id = ? AND e.results_published = 1
    ORDER BY er.created_at DESC
  `).all(studentId);

  const resultMap = new Map((publishedResults as any[]).map((r) => [r.exam_id, r]));

  const enrichedExams = exams.map((ex) => {
    let studentExamState: 'belum_mulai' | 'menunggu_jadwal' | 'sedang_berlangsung' | 'selesai' | 'waktu_habis' = 'belum_mulai';
    if (ex.active_session_id) {
      studentExamState = 'sedang_berlangsung';
    } else if (ex.completed_attempts >= ex.allowed_attempts || ex.participant_status === 'selesai') {
      studentExamState = 'selesai';
    } else if (ex.exam_status === 'terjadwal') {
      studentExamState = 'menunggu_jadwal';
    } else if (ex.exam_status === 'selesai') {
      studentExamState = 'waktu_habis';
    }

    return {
      ...ex,
      student_exam_state: studentExamState,
      published_result: ex.results_published === 1 ? resultMap.get(ex.id) || null : null,
    };
  });

  return res.json({ student, exams: enrichedExams, publishedResults });
});

// ======================== MULAI / LANJUTKAN UJIAN ========================
router.post('/exams/:examId/start', (req: Request, res: Response) => {
  const studentId = req.authUser!.studentId!;
  const examId = req.params.examId;
  const inputToken = String(req.body.token || '').trim().toUpperCase();

  const exam = db.prepare(`SELECT * FROM exams WHERE id = ? AND school_id = ?`).get(
    examId,
    req.authUser!.schoolId
  ) as any;
  if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan.' });

  const participant = db.prepare(`
    SELECT * FROM exam_participants WHERE exam_id = ? AND student_id = ?
  `).get(examId, studentId) as any;
  if (!participant) return res.status(403).json({ error: 'Anda tidak terdaftar sebagai peserta ujian ini.' });

  // Cek apakah sudah ada sesi berlangsung (resume session tanpa membuat sesi baru!)
  const activeSession = db.prepare(`
    SELECT * FROM exam_sessions WHERE exam_id = ? AND student_id = ? AND status = 'berlangsung'
  `).get(examId, studentId) as any;

  if (activeSession) {
    if (new Date(activeSession.expires_at).getTime() <= Date.now()) {
      db.prepare(`UPDATE exam_sessions SET status = 'waktu_habis', submitted_at = datetime('now'), connection_status = 'selesai' WHERE id = ?`).run(activeSession.id);
      db.prepare(`UPDATE exam_participants SET status = 'selesai' WHERE exam_id = ? AND student_id = ?`).run(examId, studentId);
      gradeSession(activeSession.id);
      return res.status(400).json({ error: 'Waktu pengerjaan ujian Anda telah berakhir.' });
    }
    return res.json({ sessionId: activeSession.id, resumed: true });
  }

  // Pembatasan 1 sesi ujian aktif per peserta di seluruh sistem
  const otherActive = db.prepare(`
    SELECT id FROM exam_sessions WHERE student_id = ? AND status = 'berlangsung' AND exam_id <> ?
  `).get(studentId, examId);
  if (otherActive) {
    return res.status(409).json({
      error: 'Anda masih memiliki sesi ujian lain yang sedang berlangsung. Selesaikan ujian tersebut terlebih dahulu.',
    });
  }

  if (exam.status !== 'aktif') {
    return res.status(400).json({ error: 'Ujian belum aktif atau telah ditutup oleh panitia.' });
  }

  if (!inputToken || inputToken !== exam.exam_token.toUpperCase()) {
    return res.status(403).json({ error: 'Token yang anda masukkan salah mohon masukan token lagi' });
  }

  const completedCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM exam_sessions WHERE exam_id = ? AND student_id = ? AND status IN ('selesai', 'waktu_habis')`).get(examId, studentId) as any
  ).c;

  if (completedCount >= participant.allowed_attempts) {
    return res.status(403).json({ error: 'Kesempatan pengerjaan ujian Anda sudah habis.' });
  }

  const examQuestions = db.prepare(`
    SELECT eq.question_id, q.question_type
    FROM exam_questions eq
    JOIN questions q ON q.id = eq.question_id
    WHERE eq.exam_id = ?
    ORDER BY eq.question_order ASC
  `).all(examId) as { question_id: string; question_type: string }[];

  if (examQuestions.length === 0) {
    return res.status(400).json({ error: 'Belum ada soal yang ditautkan ke ujian ini.' });
  }

  const questionOrder = exam.shuffle_questions === 1
    ? shuffleArray(examQuestions.map((q) => q.question_id))
    : examQuestions.map((q) => q.question_id);

  const optionOrderMap: Record<string, string[]> = {};
  const optStmt = db.prepare(`SELECT id FROM question_options WHERE question_id = ? ORDER BY sort_order ASC`);
  for (const eq of examQuestions) {
    const opts = optStmt.all(eq.question_id) as { id: string }[];
    const ids = opts.map((o) => o.id);
    optionOrderMap[eq.question_id] =
      exam.shuffle_options === 1 && eq.question_type !== 'true_false' ? shuffleArray(ids) : ids;
  }

  const maxAttemptRow = db.prepare(`SELECT COALESCE(MAX(attempt_number), 0) AS m FROM exam_sessions WHERE exam_id = ? AND student_id = ?`).get(examId, studentId) as any;
  const attemptNumber = (maxAttemptRow?.m || 0) + 1;

  const sessionId = uid();
  const startedAt = new Date();
  const totalMinutes = exam.duration_minutes + (participant.extra_minutes || 0);
  const expiresAt = new Date(startedAt.getTime() + totalMinutes * 60_000);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO exam_sessions (id, exam_id, student_id, attempt_number, session_token, question_order_json, option_order_json, started_at, expires_at, last_heartbeat_at, connection_status, status, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'terhubung', 'berlangsung', ?, ?)
    `).run(
      sessionId,
      examId,
      studentId,
      attemptNumber,
      crypto.randomBytes(24).toString('hex'),
      JSON.stringify(questionOrder),
      JSON.stringify(optionOrderMap),
      startedAt.toISOString(),
      expiresAt.toISOString(),
      startedAt.toISOString(),
      req.ip || '',
      String(req.headers['user-agent'] || '').slice(0, 200)
    );

    db.prepare(`UPDATE exam_participants SET status = 'sedang_ujian' WHERE exam_id = ? AND student_id = ?`).run(
      examId,
      studentId
    );

    db.prepare(`
      INSERT INTO exam_activity_logs (id, session_id, exam_id, student_id, event_type, details)
      VALUES (?, ?, ?, ?, 'session_started', ?)
    `).run(uid(), sessionId, examId, studentId, `Percobaan ke-${attemptNumber}`);
  });
  tx();

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'SISWA',
    action: 'START_EXAM_SESSION',
    entityType: 'exam_session',
    entityId: sessionId,
    metadata: { examId, attemptNumber },
    ipAddress: req.ip,
  });

  broadcastMonitoringEvent(req.authUser!.schoolId, { type: 'monitoring:update', examId });

  return res.status(201).json({ sessionId, resumed: false });
});

// ======================== PENGIRIMAN SOAL TANPA KUNCI JAWABAN ========================
router.get('/sessions/:sessionId', (req: Request, res: Response) => {
  const studentId = req.authUser!.studentId!;
  const session = db.prepare(`
    SELECT es.*, e.title AS exam_title, e.questions_per_page, e.duration_minutes, sub.name AS subject_name,
           s.full_name AS student_name, s.nis, c.name AS class_name
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    JOIN subjects sub ON sub.id = e.subject_id
    JOIN students s ON s.id = es.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE es.id = ? AND es.student_id = ?
  `).get(req.params.sessionId, studentId) as any;

  if (!session) return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });

  const nowMs = Date.now();
  const expiresMs = new Date(session.expires_at).getTime();

  if (session.status === 'berlangsung' && nowMs > expiresMs) {
    db.prepare(`UPDATE exam_sessions SET status = 'waktu_habis', submitted_at = datetime('now'), connection_status = 'selesai' WHERE id = ?`).run(session.id);
    db.prepare(`UPDATE exam_participants SET status = 'selesai' WHERE exam_id = ? AND student_id = ?`).run(session.exam_id, studentId);
    gradeSession(session.id);
    return res.status(410).json({ error: 'Waktu ujian telah habis dan jawaban telah dikumpulkan otomatis.' });
  }

  if (session.status !== 'berlangsung') {
    return res.status(410).json({ error: 'Sesi ujian ini telah berakhir atau direset oleh admin.' });
  }

  let questionOrder: string[] = [];
  let optionOrderMap: Record<string, string[]> = {};
  try {
    questionOrder = JSON.parse(session.question_order_json || '[]');
    optionOrderMap = JSON.parse(session.option_order_json || '{}');
  } catch {
    questionOrder = [];
  }

  // Ambil soal HANYA kolom non-sensitif (TANPA correct_answer_text, answer_rules_json, explanation, atau is_correct!)
  const qStmt = db.prepare(`
    SELECT id, question_type, content_html, latex_formula, image_url, image_width, table_json, weight
    FROM questions WHERE id = ?
  `);
  const optStmt = db.prepare(`
    SELECT id, option_label, content_html, image_url, sort_order
    FROM question_options WHERE question_id = ?
  `);

  const questions = questionOrder
    .map((qid, index) => {
      const q = qStmt.get(qid) as any;
      if (!q) return null;
      const rawOpts = optStmt.all(qid) as any[];
      const optMap = new Map(rawOpts.map((o) => [o.id, o]));
      const orderedIds = optionOrderMap[qid] || rawOpts.map((o) => o.id);
      const displayLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
      const options = orderedIds
        .map((oid, oIdx) => {
          const opt = optMap.get(oid);
          if (!opt) return null;
          return {
            id: opt.id,
            option_label: q.question_type === 'true_false' ? opt.option_label : displayLabels[oIdx] || opt.option_label,
            content_html: opt.content_html,
            image_url: opt.image_url,
          };
        })
        .filter(Boolean);

      return {
        number: index + 1,
        ...q,
        options,
      };
    })
    .filter(Boolean);

  const answers = db.prepare(`
    SELECT question_id, selected_option_ids_json, answer_text, is_flagged, client_seq
    FROM student_answers WHERE session_id = ?
  `).all(session.id);

  return res.json({
    session: {
      id: session.id,
      exam_id: session.exam_id,
      exam_title: session.exam_title,
      subject_name: session.subject_name,
      student_name: session.student_name,
      nis: session.nis,
      class_name: session.class_name,
      questions_per_page: session.questions_per_page,
      started_at: session.started_at,
      expires_at: session.expires_at,
      server_time: new Date().toISOString(),
      remaining_seconds: Math.max(0, Math.floor((expiresMs - nowMs) / 1000)),
      suspicious_count: session.suspicious_count,
    },
    questions,
    answers,
  });
});

// ======================== AUTOSAVE JAWABAN IDEMPOTENT ========================
const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).default([]),
  answerText: z.string().max(10000).default(''),
  isFlagged: z.boolean().default(false),
  idempotencyKey: z.string().max(128).optional(),
  clientSeq: z.number().int().min(0).default(0),
});

router.put('/sessions/:sessionId/answers', (req: Request, res: Response) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Format jawaban tidak valid.' });

  const studentId = req.authUser!.studentId!;
  const session = db.prepare(`SELECT * FROM exam_sessions WHERE id = ? AND student_id = ?`).get(
    req.params.sessionId,
    studentId
  ) as any;

  if (!session) return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
  if (session.status !== 'berlangsung') {
    return res.status(409).json({ error: 'Sesi ujian sudah ditutup.' });
  }

  const nowMs = Date.now();
  const expiresMs = new Date(session.expires_at).getTime();
  if (nowMs > expiresMs) {
    db.prepare(`UPDATE exam_sessions SET status = 'waktu_habis', submitted_at = datetime('now'), connection_status = 'selesai' WHERE id = ?`).run(session.id);
    db.prepare(`UPDATE exam_participants SET status = 'selesai' WHERE exam_id = ? AND student_id = ?`).run(session.exam_id, studentId);
    gradeSession(session.id);
    return res.status(410).json({ error: 'Waktu ujian telah habis. Jawaban tidak dapat diubah lagi.' });
  }

  const d = parsed.data;
  const existing = db.prepare(`SELECT client_seq FROM student_answers WHERE session_id = ? AND question_id = ?`).get(
    session.id,
    d.questionId
  ) as { client_seq: number } | undefined;

  if (existing && d.clientSeq > 0 && d.clientSeq < existing.client_seq) {
    return res.json({
      saved: true,
      ignoredOlderSeq: true,
      serverTime: new Date().toISOString(),
      remainingSeconds: Math.max(0, Math.floor((expiresMs - nowMs) / 1000)),
    });
  }

  db.prepare(`
    INSERT INTO student_answers (id, session_id, question_id, selected_option_ids_json, answer_text, is_flagged, idempotency_key, client_seq, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(session_id, question_id) DO UPDATE SET
      selected_option_ids_json = excluded.selected_option_ids_json,
      answer_text = excluded.answer_text,
      is_flagged = excluded.is_flagged,
      idempotency_key = excluded.idempotency_key,
      client_seq = excluded.client_seq,
      updated_at = datetime('now')
  `).run(
    uid(),
    session.id,
    d.questionId,
    JSON.stringify(d.selectedOptionIds),
    d.answerText,
    d.isFlagged ? 1 : 0,
    d.idempotencyKey || null,
    d.clientSeq
  );

  db.prepare(`UPDATE exam_sessions SET last_heartbeat_at = datetime('now'), connection_status = 'terhubung' WHERE id = ?`).run(
    session.id
  );

  return res.json({
    saved: true,
    serverTime: new Date().toISOString(),
    remainingSeconds: Math.max(0, Math.floor((expiresMs - nowMs) / 1000)),
  });
});

// ======================== HEARTBEAT & ACTIVITY LOG ========================
const activitySchema = z.object({
  eventType: z.enum(['heartbeat', 'fullscreen_exit', 'tab_switch', 'window_blur', 'connection_lost', 'connection_restored']),
  details: z.string().max(400).optional().default(''),
});

router.post('/sessions/:sessionId/activity', (req: Request, res: Response) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Jenis aktivitas tidak valid.' });

  const studentId = req.authUser!.studentId!;
  const session = db.prepare(`SELECT * FROM exam_sessions WHERE id = ? AND student_id = ?`).get(
    req.params.sessionId,
    studentId
  ) as any;
  if (!session || session.status !== 'berlangsung') {
    return res.json({ ok: false, remainingSeconds: 0 });
  }

  const nowMs = Date.now();
  const expiresMs = new Date(session.expires_at).getTime();
  const remainingSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));

  db.prepare(`UPDATE exam_sessions SET last_heartbeat_at = datetime('now'), connection_status = 'terhubung' WHERE id = ?`).run(
    session.id
  );

  if (parsed.data.eventType !== 'heartbeat') {
    const isAlert = ['fullscreen_exit', 'tab_switch', 'window_blur'].includes(parsed.data.eventType);
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO exam_activity_logs (id, session_id, exam_id, student_id, event_type, details)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uid(), session.id, session.exam_id, studentId, parsed.data.eventType, parsed.data.details);

      if (isAlert) {
        db.prepare(`UPDATE exam_sessions SET suspicious_count = suspicious_count + 1 WHERE id = ?`).run(session.id);
      }
    });
    tx();

    broadcastMonitoringEvent(req.authUser!.schoolId, {
      type: 'activity:alert',
      examId: session.exam_id,
      payload: { studentId, eventType: parsed.data.eventType },
    });
  }

  return res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    remainingSeconds,
  });
});

// ======================== SUBMIT UJIAN ========================
router.post('/sessions/:sessionId/submit', (req: Request, res: Response) => {
  const studentId = req.authUser!.studentId!;
  const isTimeout = Boolean(req.body?.isTimeout);

  const session = db.prepare(`SELECT * FROM exam_sessions WHERE id = ? AND student_id = ?`).get(
    req.params.sessionId,
    studentId
  ) as any;
  if (!session) return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });

  // Idempotent: jika sudah pernah disubmit, kembalikan hasil tanpa menggandakan submit
  if (session.status === 'selesai' || session.status === 'waktu_habis') {
    const existingResult = db.prepare(`SELECT * FROM exam_results WHERE session_id = ?`).get(session.id);
    return res.json({ alreadySubmitted: true, status: session.status, result: existingResult });
  }

  const finalStatus = isTimeout || Date.now() > new Date(session.expires_at).getTime() ? 'waktu_habis' : 'selesai';

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE exam_sessions
      SET status = ?, submitted_at = datetime('now'), connection_status = 'selesai'
      WHERE id = ? AND status = 'berlangsung'
    `).run(finalStatus, session.id);

    db.prepare(`
      UPDATE exam_participants SET status = 'selesai' WHERE exam_id = ? AND student_id = ?
    `).run(session.exam_id, studentId);

    db.prepare(`
      INSERT INTO exam_activity_logs (id, session_id, exam_id, student_id, event_type, details)
      VALUES (?, ?, ?, ?, 'session_submitted', ?)
    `).run(uid(), session.id, session.exam_id, studentId, finalStatus === 'waktu_habis' ? 'Submit otomatis waktu habis' : 'Submit manual peserta');
  });
  tx();

  const gradedResult = gradeSession(session.id) as any;
  const exam = db.prepare(`SELECT results_published FROM exams WHERE id = ?`).get(session.exam_id) as any;

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'SISWA',
    action: 'SUBMIT_EXAM',
    entityType: 'exam_session',
    entityId: session.id,
    metadata: { examId: session.exam_id, status: finalStatus },
    ipAddress: req.ip,
  });

  broadcastMonitoringEvent(req.authUser!.schoolId, { type: 'monitoring:update', examId: session.exam_id });

  return res.json({
    ok: true,
    status: finalStatus,
    resultsPublished: exam?.results_published === 1,
    result: exam?.results_published === 1 ? gradedResult : null,
  });
});

export default router;
