import { db, uid } from '../db/sqlite.ts';

function applyRounding(value: number, mode: string): number {
  switch (mode) {
    case 'nearest_int':
      return Math.round(value);
    case 'one_decimal':
      return Math.round(value * 10) / 10;
    case 'two_decimals':
      return Math.round(value * 100) / 100;
    case 'none':
    default:
      return Number(value.toFixed(4));
  }
}

export function gradeSession(sessionId: string) {
  const session = db.prepare(`SELECT * FROM exam_sessions WHERE id = ?`).get(sessionId) as any;
  if (!session) throw new Error('Sesi ujian tidak ditemukan');

  const exam = db.prepare(`SELECT * FROM exams WHERE id = ?`).get(session.exam_id) as any;
  if (!exam) throw new Error('Data ujian tidak ditemukan');

  const examQuestions = db.prepare(`
    SELECT q.*, eq.custom_weight, eq.question_order
    FROM exam_questions eq
    JOIN questions q ON q.id = eq.question_id
    WHERE eq.exam_id = ?
    ORDER BY eq.question_order ASC
  `).all(exam.id) as any[];

  const answers = db.prepare(`SELECT * FROM student_answers WHERE session_id = ?`).all(sessionId) as any[];
  const answerMap = new Map<string, any>();
  for (const a of answers) {
    answerMap.set(a.question_id, a);
  }

  let rawScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let needsManualGrading = false;

  const updateAnswerStmt = db.prepare(`
    UPDATE student_answers
    SET is_correct = ?, auto_score = ?
    WHERE session_id = ? AND question_id = ?
  `);

  const insertEmptyAnswerStmt = db.prepare(`
    INSERT INTO student_answers (id, session_id, question_id, selected_option_ids_json, answer_text, is_flagged, is_correct, auto_score)
    VALUES (?, ?, ?, '[]', '', 0, 0, 0)
  `);

  const tx = db.transaction(() => {
    for (const q of examQuestions) {
      const weight = Number(q.custom_weight ?? q.weight ?? 1);
      maxScore += weight;

      const ans = answerMap.get(q.id);
      let selectedIds: string[] = [];
      try {
        selectedIds = ans ? JSON.parse(ans.selected_option_ids_json || '[]') : [];
      } catch {
        selectedIds = [];
      }
      const answerText = ans ? String(ans.answer_text || '').trim() : '';

      if (q.question_type === 'essay') {
        if (!ans) {
          insertEmptyAnswerStmt.run(uid(), sessionId, q.id);
        }

        if (ans && ans.manual_score !== null && ans.manual_score !== undefined && !Number.isNaN(Number(ans.manual_score))) {
          const mScore = Math.min(weight, Math.max(0, Number(ans.manual_score)));
          rawScore += mScore;
          if (mScore >= weight * 0.6) correctCount += 1;
          else wrongCount += 1;
          updateAnswerStmt.run(mScore >= weight * 0.6 ? 1 : 0, 0, sessionId, q.id);
        } else {
          needsManualGrading = true;
          if (answerText.length === 0) {
            unansweredCount += 1;
          }
          if (ans) {
            updateAnswerStmt.run(0, 0, sessionId, q.id);
          }
        }
        continue;
      }

      const isUnanswered =
        q.question_type === 'short_answer'
          ? answerText.length === 0
          : selectedIds.length === 0;

      if (isUnanswered) {
        unansweredCount += 1;
        if (ans) {
          updateAnswerStmt.run(0, 0, sessionId, q.id);
        } else {
          insertEmptyAnswerStmt.run(uid(), sessionId, q.id);
        }
        continue;
      }

      if (q.question_type === 'single_choice' || q.question_type === 'true_false') {
        const correctOpts = db
          .prepare(`SELECT id FROM question_options WHERE question_id = ? AND is_correct = 1`)
          .all(q.id) as { id: string }[];
        const correctSet = new Set(correctOpts.map((o) => o.id));
        const isCorrect = selectedIds.length === 1 && correctSet.has(selectedIds[0]);
        const score = isCorrect ? weight : 0;
        rawScore += score;
        if (isCorrect) correctCount += 1;
        else wrongCount += 1;
        updateAnswerStmt.run(isCorrect ? 1 : 0, score, sessionId, q.id);
      } else if (q.question_type === 'multiple_choice') {
        const allOpts = db
          .prepare(`SELECT id, is_correct FROM question_options WHERE question_id = ?`)
          .all(q.id) as { id: string; is_correct: number }[];
        const correctIds = allOpts.filter((o) => o.is_correct === 1).map((o) => o.id);
        const correctSet = new Set(correctIds);
        const selectedSet = new Set(selectedIds);

        let matchedCorrect = 0;
        let selectedWrong = 0;
        for (const id of selectedSet) {
          if (correctSet.has(id)) matchedCorrect += 1;
          else selectedWrong += 1;
        }

        const isExact = matchedCorrect === correctIds.length && selectedWrong === 0 && correctIds.length > 0;
        let score = 0;
        if (isExact) {
          score = weight;
          correctCount += 1;
        } else if (correctIds.length > 0 && matchedCorrect > 0) {
          // Penilaian proporsional dikurangi penalti pilihan keliru (minimum 0)
          const ratio = Math.max(0, (matchedCorrect - selectedWrong * 0.5) / correctIds.length);
          score = Number((weight * ratio).toFixed(2));
          if (score > 0 && ratio >= 0.5) correctCount += 1;
          else wrongCount += 1;
        } else {
          wrongCount += 1;
        }

        rawScore += score;
        updateAnswerStmt.run(isExact ? 1 : 0, score, sessionId, q.id);
      } else if (q.question_type === 'short_answer') {
        let rules: { aliases?: string[]; caseSensitive?: boolean } = {};
        try {
          rules = JSON.parse(q.answer_rules_json || '{}');
        } catch {
          rules = {};
        }
        const candidates = [q.correct_answer_text || '', ...(rules.aliases || [])]
          .map((s) => String(s).trim())
          .filter(Boolean);
        const norm = (v: string) => (rules.caseSensitive ? v.trim() : v.trim().toLowerCase());
        const isCorrect = candidates.some((c) => norm(c) === norm(answerText));
        const score = isCorrect ? weight : 0;
        rawScore += score;
        if (isCorrect) correctCount += 1;
        else wrongCount += 1;
        updateAnswerStmt.run(isCorrect ? 1 : 0, score, sessionId, q.id);
      }
    }

    const normalized = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
    const finalScore = applyRounding(normalized, exam.rounding_mode);
    const publishedAt = exam.results_published === 1 ? new Date().toISOString() : null;

    const existingResult = db.prepare(`SELECT id FROM exam_results WHERE session_id = ?`).get(sessionId) as any;
    if (existingResult) {
      db.prepare(`
        UPDATE exam_results
        SET raw_score = ?, max_score = ?, final_score = ?, correct_count = ?, wrong_count = ?,
            unanswered_count = ?, needs_manual_grading = ?, published_at = ?, updated_at = datetime('now')
        WHERE session_id = ?
      `).run(
        rawScore,
        maxScore,
        finalScore,
        correctCount,
        wrongCount,
        unansweredCount,
        needsManualGrading ? 1 : 0,
        publishedAt,
        sessionId
      );
    } else {
      db.prepare(`
        INSERT INTO exam_results (id, exam_id, session_id, student_id, raw_score, max_score, final_score, correct_count, wrong_count, unanswered_count, needs_manual_grading, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid(),
        exam.id,
        sessionId,
        session.student_id,
        rawScore,
        maxScore,
        finalScore,
        correctCount,
        wrongCount,
        unansweredCount,
        needsManualGrading ? 1 : 0,
        publishedAt
      );
    }
  });

  tx();

  return db.prepare(`SELECT * FROM exam_results WHERE session_id = ?`).get(sessionId);
}
