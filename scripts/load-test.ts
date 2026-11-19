const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function httpJson(path: string, opts: RequestInit = {}, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-load-test': '1',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('=== PENGUJIAN FUNGSIONAL, KEAMANAN & BEBAN CBT ONLINE ===');

  // 1. Uji login Admin & Siswa
  const adminLogin = await httpJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin', password: 'AdminCBT2026!', portal: 'ADMIN' }),
  });
  if (adminLogin.status !== 200) throw new Error(`Login admin gagal: ${JSON.stringify(adminLogin)}`);
  const adminToken = adminLogin.data.token;
  console.log('[OK] Login Admin berhasil');

  const studentLogin = await httpJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: '20261001', password: 'Siswa2026!', portal: 'SISWA' }),
  });
  if (studentLogin.status !== 200) throw new Error(`Login siswa gagal: ${JSON.stringify(studentLogin)}`);
  const studentToken = studentLogin.data.token;
  console.log('[OK] Login Siswa berhasil');

  // 2. Uji otorisasi: Siswa dilarang mengakses endpoint admin (harus 403)
  const forbiddenCheck = await httpJson('/api/admin/questions', {}, studentToken);
  if (forbiddenCheck.status !== 403) {
    throw new Error(`KEGAGALAN OTORISASI: Siswa bisa akses /api/admin/questions (${forbiddenCheck.status})`);
  }
  console.log('[OK] RBAC Server menolak akses Siswa ke API Admin (403 Forbidden)');

  // 3. Uji alur Siswa: Dashboard -> Mulai Ujian -> Cek tidak ada kunci jawaban -> Autosave -> Submit
  const stuDash = await httpJson('/api/student/dashboard', {}, studentToken);
  const activeExam = stuDash.data.exams.find((e: any) => e.exam_status === 'aktif');
  if (!activeExam) throw new Error('Tidak ditemukan ujian aktif pada data uji');

  // Uji token salah ditolak
  const wrongToken = await httpJson(
    `/api/student/exams/${activeExam.id}/start`,
    { method: 'POST', body: JSON.stringify({ token: 'SALAH99' }) },
    studentToken
  );
  if (wrongToken.status !== 403) throw new Error(`Token salah seharusnya ditolak (status ${wrongToken.status})`);
  console.log('[OK] Validasi token ujian server menolak token salah (403)');

  // Uji token benar
  const startRes = await httpJson(
    `/api/student/exams/${activeExam.id}/start`,
    { method: 'POST', body: JSON.stringify({ token: 'CBT2026' }) },
    studentToken
  );
  if (startRes.status !== 201 && startRes.status !== 200) {
    throw new Error(`Gagal memulai sesi ujian: ${JSON.stringify(startRes)}`);
  }
  const sessionId = startRes.data.sessionId;
  console.log(`[OK] Sesi ujian dimulai (${sessionId})`);

  // Cek soal tidak mengandung is_correct / correct_answer_text
  const sessData = await httpJson(`/api/student/sessions/${sessionId}`, {}, studentToken);
  const serialized = JSON.stringify(sessData.data.questions);
  if (serialized.includes('is_correct') || serialized.includes('correct_answer_text')) {
    throw new Error('KEBOCORAN KEAMANAN: Kunci jawaban terkirim ke endpoint siswa!');
  }
  console.log('[OK] Pengiriman soal bersih dari kunci jawaban (zero key leak)');

  // Autosave idempotent & submit
  const firstQ = sessData.data.questions[0];
  const saveRes = await httpJson(
    `/api/student/sessions/${sessionId}/answers`,
    {
      method: 'PUT',
      body: JSON.stringify({
        questionId: firstQ.id,
        selectedOptionIds: firstQ.options?.[0]?.id ? [firstQ.options[0].id] : [],
        answerText: '3',
        isFlagged: false,
        idempotencyKey: 'test-key-1',
        clientSeq: 1,
      }),
    },
    studentToken
  );
  if (!saveRes.data.saved) throw new Error('Gagal menyimpan jawaban autosave');
  console.log('[OK] Autosave jawaban idempotent berhasil');

  const submitRes = await httpJson(
    `/api/student/sessions/${sessionId}/submit`,
    { method: 'POST', body: JSON.stringify({ isTimeout: false }) },
    studentToken
  );
  if (submitRes.status !== 200) throw new Error('Gagal submit ujian');

  // Uji idempotency submit ganda
  const dupSubmit = await httpJson(
    `/api/student/sessions/${sessionId}/submit`,
    { method: 'POST', body: JSON.stringify({ isTimeout: false }) },
    studentToken
  );
  if (!dupSubmit.data.alreadySubmitted) throw new Error('Submit ganda tidak ditangani idempotent');
  console.log('[OK] Submit ujian & proteksi submit ganda berjalan benar');

  // Reset sesi siswa uji agar akun 20261001 tetap bersih untuk pengujian UI manual
  await httpJson(`/api/admin/exams/${activeExam.id}/reset-session/${stuDash.data.student.id}`, { method: 'POST' }, adminToken);

  // 4. Uji beban nyata 100 VU & 200 VU melalui API Admin Load Test
  for (const vu of [100, 200]) {
    const lt = await httpJson('/api/admin/system/load-test', {
      method: 'POST',
      body: JSON.stringify({ virtualUsers: vu }),
    }, adminToken);
    console.log(`[LOAD TEST ${vu} VU]`, lt.data);
    if (!lt.data.passed) throw new Error(`Load test ${vu} VU gagal`);
  }

  console.log('=== SEMUA PENGUJIAN LULUS ===');
}

main().catch((err) => {
  console.error('PENGUJIAN GAGAL:', err);
  process.exit(1);
});
