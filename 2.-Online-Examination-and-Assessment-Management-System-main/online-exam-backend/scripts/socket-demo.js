/**
 * Live demonstration of the real-time features (run while the server is up,
 * after `npm run seed`):
 *
 *   npm run socket:demo
 *
 * 1. faculty1 logs in, connects a socket and joins the live monitor of the
 *    "Express & MVC Mid-Term" exam.
 * 2. A student logs in, connects a socket, starts the exam, saves an answer
 *    and submits.
 * 3. The faculty terminal output shows attempt:started -> attempt:progress ->
 *    attempt:submitted arriving in real time; the student receives attempt:submitted.
 */
const { io } = require('socket.io-client');

const BASE_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
const EXAM_TITLE = 'Express & MVC Mid-Term';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function login(email, password) {
  const { status, body } = await api('POST', '/auth/login', { body: { email, password } });
  if (status !== 200) throw new Error(`Login failed for ${email}: ${body.error && body.error.message}`);
  return body.data.accessToken;
}

function connect(label, token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { auth: { token }, transports: ['websocket'] });
    socket.on('connected', (info) => {
      console.log(`[${label}] connected; rooms: ${info.rooms.join(', ')}`);
      resolve(socket);
    });
    socket.on('connect_error', (err) => reject(new Error(`[${label}] ${err.message}`)));
  });
}

async function main() {
  console.log(`Demo against ${BASE_URL}\n`);

  // ---- Faculty side ----
  const facultyToken = await login('faculty1@exam.local', 'Faculty@123');
  const { body: examList } = await api('GET', `/exams?search=${encodeURIComponent('Express')}`, { token: facultyToken });
  const exam = examList.data.find((e) => e.title === EXAM_TITLE);
  if (!exam) throw new Error(`Exam "${EXAM_TITLE}" not found. Run npm run seed first.`);

  const faculty = await connect('faculty', facultyToken);
  ['attempt:started', 'attempt:progress', 'attempt:submitted'].forEach((event) => {
    faculty.on(event, (payload) => console.log(`[faculty] <- ${event}`, JSON.stringify(payload)));
  });
  const joined = await faculty.emitWithAck('monitor:join', { examId: exam.id });
  if (!joined.ok) throw new Error(`monitor:join failed: ${joined.error.message}`);
  console.log(`[faculty] monitoring "${exam.title}": ${JSON.stringify(joined.data.counts)}\n`);

  // ---- Student side: find a student (CSE-3A) who still has an attempt left ----
  let student = null;
  for (let n = 10; n >= 3 && !student; n -= 1) {
    const email = `student${n}@exam.local`;
    // eslint-disable-next-line no-await-in-loop
    const token = await login(email, 'Student@123');
    // eslint-disable-next-line no-await-in-loop
    const started = await api('POST', `/student/exams/${exam.id}/attempts`, { token });
    if (started.status === 201 || started.status === 200) {
      student = { email, token, attempt: started.body.data };
    } else {
      console.log(`[student] ${email}: ${started.body.error.code}, trying another student`);
    }
  }
  if (!student) throw new Error('No seeded student has an attempt left. Re-run npm run seed.');

  const studentSocket = await connect('student', student.token);
  studentSocket.on('attempt:submitted', (payload) => console.log('[student] <- attempt:submitted', JSON.stringify(payload)));

  const { attempt } = student;
  console.log(`[student] ${student.email} started attempt ${attempt.attemptId} with ${attempt.totalQuestions} questions`);
  await wait(500);

  const first = attempt.questions[0];
  const saved = await api('PATCH', `/attempts/${attempt.attemptId}/answers`, {
    token: student.token,
    body: { answers: [{ questionId: first.questionId, optionId: first.options[0].id }] },
  });
  console.log(`[student] saved answer -> HTTP ${saved.status}, answered ${saved.body.data.answeredCount}/${saved.body.data.totalQuestions}`);
  await wait(500);

  const submitted = await api('POST', `/attempts/${attempt.attemptId}/submit`, { token: student.token, body: {} });
  console.log(`[student] submitted -> HTTP ${submitted.status}, status ${submitted.body.data.status}`);

  const again = await api('POST', `/attempts/${attempt.attemptId}/submit`, { token: student.token, body: {} });
  console.log(`[student] submitted again -> HTTP ${again.status} ${again.body.error.code} (duplicate blocked)`);

  await wait(1000);
  faculty.disconnect();
  studentSocket.disconnect();
  console.log('\nDemo complete.');
}

main().catch((err) => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
