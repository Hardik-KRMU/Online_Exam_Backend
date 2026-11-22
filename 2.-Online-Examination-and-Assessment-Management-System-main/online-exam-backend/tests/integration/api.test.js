/**
 * End-to-end API tests against a real (in-memory) MongoDB.
 *   npm run test:integration
 * Requires the dev dependencies (supertest, mongodb-memory-server). The first
 * run downloads a MongoDB binary (needs internet once).
 */
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef012345678';
process.env.MONGODB_URI = 'mongodb://placeholder'; // replaced below by the in-memory server
process.env.BCRYPT_SALT_ROUNDS = '4'; // faster hashing in tests only

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let mongod;
let api;
let models;
let seeded;

const tokens = {};

async function login(email, password) {
  const res = await api.post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Online Examination API', () => {
  before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();

    const supertest = require('supertest');
    const app = require('../../src/app');
    const { connectDB } = require('../../src/config/db');
    await connectDB(process.env.MONGODB_URI);

    const { seedDatabase } = require('../../scripts/seed');
    seeded = await seedDatabase({ quiet: true });
    models = require('../../src/models');
    api = supertest(app);

    tokens.admin = (await login('admin@exam.local', 'Admin@123')).accessToken;
    tokens.faculty1 = (await login('faculty1@exam.local', 'Faculty@123')).accessToken;
    tokens.faculty2 = (await login('faculty2@exam.local', 'Faculty@123')).accessToken;
    tokens.student1 = (await login('student1@exam.local', 'Student@123')).accessToken;
    tokens.student2 = (await login('student2@exam.local', 'Student@123')).accessToken;
    tokens.student3 = (await login('student3@exam.local', 'Student@123')).accessToken;
  });

  after(async () => {
    const mongoose = require('mongoose');
    await new Promise((resolve) => setTimeout(resolve, 200)); // let async audit writes finish
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  const examId = (key) => String(seeded.exams[key]._id);

  // ------------------------------------------------------------ auth
  describe('authentication', () => {
    it('GET /api/health works without a token', async () => {
      const res = await api.get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, 'ok');
    });

    it('rejects a wrong password with 401 and a generic message', async () => {
      const res = await api.post('/api/auth/login').send({ email: 'student1@exam.local', password: 'Wrong@123' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    });

    it('rejects registration that tries to set role=admin (400)', async () => {
      const res = await api.post('/api/auth/register').send({
        name: 'Mallory',
        email: 'mallory@exam.local',
        password: 'Secret@123',
        rollNumber: '23CSE999',
        sectionCode: 'CSE-3A',
        role: 'admin',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some((d) => d.field === 'role'));
    });

    it('registers a student and returns tokens (201); duplicate email -> 409', async () => {
      const body = {
        name: 'New Student',
        email: 'new.student@exam.local',
        password: 'Secret@123',
        rollNumber: '23CSE100',
        sectionCode: 'CSE-3B',
      };
      const first = await api.post('/api/auth/register').send(body);
      assert.equal(first.status, 201);
      assert.equal(first.body.data.user.role, 'student');
      assert.ok(first.body.data.accessToken);
      assert.equal(first.body.data.user.password, undefined);

      const second = await api.post('/api/auth/register').send({ ...body, rollNumber: '23CSE101' });
      assert.equal(second.status, 409);
    });

    it('returns 401 without a token and with a malformed token', async () => {
      assert.equal((await api.get('/api/users/me')).status, 401);
      const res = await api.get('/api/users/me').set(auth('not-a-jwt'));
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'TOKEN_INVALID');
    });

    it('rotates refresh tokens and detects reuse of an old one', async () => {
      const session = await login('student4@exam.local', 'Student@123');
      const rotated = await api.post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      assert.equal(rotated.status, 200);
      assert.notEqual(rotated.body.data.refreshToken, session.refreshToken);

      // Re-using the first (now revoked) token = suspected theft.
      const reuse = await api.post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      assert.equal(reuse.status, 401);
      assert.equal(reuse.body.error.code, 'REFRESH_TOKEN_REUSED');

      // The whole family is revoked, including the newer token.
      const newer = await api.post('/api/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken });
      assert.equal(newer.status, 401);
    });

    it('logout revokes the refresh token', async () => {
      const session = await login('student5@exam.local', 'Student@123');
      const out = await api.post('/api/auth/logout').send({ refreshToken: session.refreshToken });
      assert.equal(out.status, 200);
      const refresh = await api.post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
      assert.equal(refresh.status, 401);
    });
  });

  // ------------------------------------------------------------ RBAC
  describe('role-based access control', () => {
    it('student cannot read the question bank (403)', async () => {
      const res = await api.get('/api/questions').set(auth(tokens.student1));
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'INSUFFICIENT_ROLE');
    });

    it('faculty cannot list users (admin only)', async () => {
      const res = await api.get('/api/users').set(auth(tokens.faculty1));
      assert.equal(res.status, 403);
    });

    it("faculty1 cannot manage or report on faculty2's exam", async () => {
      const id = examId('OTHER_FACULTY');
      assert.equal((await api.get(`/api/exams/${id}`).set(auth(tokens.faculty1))).status, 403);
      assert.equal((await api.get(`/api/reports/exams/${id}/summary`).set(auth(tokens.faculty1))).status, 403);
      assert.equal((await api.get(`/api/exams/${id}`).set(auth(tokens.admin))).status, 200);
    });

    it('faculty sees answer keys in the question bank', async () => {
      const res = await api.get('/api/questions?limit=5').set(auth(tokens.faculty1));
      assert.equal(res.status, 200);
      assert.ok(res.body.data[0].correctOptionId);
      assert.ok(res.body.meta.total > 5);
    });
  });

  // ------------------------------------------------------------ question bank
  describe('question bank validation', () => {
    it('rejects a question with one option (400)', async () => {
      const res = await api
        .post('/api/questions')
        .set(auth(tokens.faculty1))
        .send({
          course: String(seeded.courses.backend._id),
          text: 'Only one option?',
          options: [{ text: 'Yes' }],
          correctOptionIndex: 0,
          topic: 'misc',
        });
      assert.equal(res.status, 400);
    });

    it('rejects correctOptionIndex outside the options (400)', async () => {
      const res = await api
        .post('/api/questions')
        .set(auth(tokens.faculty1))
        .send({
          course: String(seeded.courses.backend._id),
          text: 'Which port does the server use?',
          options: [{ text: '5000' }, { text: '27017' }],
          correctOptionIndex: 5,
          topic: 'misc',
        });
      assert.equal(res.status, 400);
    });

    it("faculty1 cannot add questions to faculty2's course (403)", async () => {
      const res = await api
        .post('/api/questions')
        .set(auth(tokens.faculty1))
        .send({
          course: String(seeded.courses.dbms._id),
          text: 'What is a tuple?',
          options: [{ text: 'A row' }, { text: 'A column' }],
          correctOptionIndex: 0,
          topic: 'sql',
        });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'COURSE_NOT_ASSIGNED');
    });

    it('returns 404 for a valid but unknown id, 400 for a malformed id', async () => {
      assert.equal((await api.get('/api/questions/000000000000000000000000').set(auth(tokens.faculty1))).status, 404);
      assert.equal((await api.get('/api/questions/abc').set(auth(tokens.faculty1))).status, 400);
    });
  });

  // ------------------------------------------------------------ exam rules
  describe('examination access rules', () => {
    it('student sees only exams assigned to them', async () => {
      const res = await api.get('/api/student/exams?limit=50').set(auth(tokens.student1));
      assert.equal(res.status, 200);
      const titles = res.body.data.map((e) => e.title);
      assert.ok(titles.includes(seeded.exams.LIVE.title));
      assert.ok(titles.includes(seeded.exams.OTHER_FACULTY.title)); // assigned via course
      assert.ok(!titles.includes(seeded.exams.SECTION_C_ONLY.title)); // section C only
      assert.ok(!titles.includes(seeded.exams.DRAFT.title)); // drafts are hidden
    });

    it('cannot start an exam not assigned to the student (403)', async () => {
      const res = await api.post(`/api/student/exams/${examId('SECTION_C_ONLY')}/attempts`).set(auth(tokens.student1));
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'EXAM_NOT_ASSIGNED');
    });

    it('cannot start before the window opens or after it closes (403)', async () => {
      const early = await api.post(`/api/student/exams/${examId('UPCOMING')}/attempts`).set(auth(tokens.student1));
      assert.equal(early.status, 403);
      assert.equal(early.body.error.code, 'EXAM_NOT_STARTED');
      const late = await api.post(`/api/student/exams/${examId('CLOSED')}/attempts`).set(auth(tokens.student1));
      assert.equal(late.status, 403);
      assert.equal(late.body.error.code, 'EXAM_CLOSED');
    });

    it('rejects an exam whose end is before its start (400)', async () => {
      const res = await api
        .post('/api/exams')
        .set(auth(tokens.faculty1))
        .send({
          title: 'Bad timing',
          course: String(seeded.courses.backend._id),
          durationMinutes: 30,
          startTime: '2026-12-10T10:00:00Z',
          endTime: '2026-12-10T09:00:00Z',
        });
      assert.equal(res.status, 400);
    });

    it('rejects a duration longer than the exam window (400)', async () => {
      const res = await api
        .post('/api/exams')
        .set(auth(tokens.faculty1))
        .send({
          title: 'Too long',
          course: String(seeded.courses.backend._id),
          durationMinutes: 120,
          startTime: '2026-12-10T10:00:00Z',
          endTime: '2026-12-10T11:00:00Z',
        });
      assert.equal(res.status, 400);
    });
  });

  // ------------------------------------------------------------ attempt workflow
  describe('attempt workflow', () => {
    let attempt;

    it('starts an attempt with a personal paper and NO answer key', async () => {
      const res = await api.post(`/api/student/exams/${examId('LIVE')}/attempts`).set(auth(tokens.student1));
      assert.equal(res.status, 201);
      attempt = res.body.data;
      assert.equal(attempt.totalQuestions, 10);
      assert.equal(attempt.questions.length, 10);
      const raw = JSON.stringify(res.body);
      assert.ok(!raw.includes('correctOption'), 'answer key leaked');
      assert.ok(!raw.includes('isCorrect'), 'correctness leaked');
    });

    it('resumes the same attempt on a second start (200)', async () => {
      const res = await api.post(`/api/student/exams/${examId('LIVE')}/attempts`).set(auth(tokens.student1));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.attemptId, attempt.attemptId);
    });

    it("another student cannot read this attempt (404)", async () => {
      const res = await api.get(`/api/attempts/${attempt.attemptId}`).set(auth(tokens.student2));
      assert.equal(res.status, 404);
    });

    it('rejects an answer for a question not in the attempt (400)', async () => {
      const res = await api
        .patch(`/api/attempts/${attempt.attemptId}/answers`)
        .set(auth(tokens.student1))
        .send({ answers: [{ questionId: '000000000000000000000001', optionId: attempt.questions[0].options[0].id }] });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_ANSWER');
    });

    it("rejects an option that belongs to a different question (400)", async () => {
      const res = await api
        .patch(`/api/attempts/${attempt.attemptId}/answers`)
        .set(auth(tokens.student1))
        .send({ answers: [{ questionId: attempt.questions[0].questionId, optionId: attempt.questions[1].options[0].id }] });
      assert.equal(res.status, 400);
    });

    it('saves valid answers and reports progress', async () => {
      const answers = attempt.questions.slice(0, 3).map((q) => ({ questionId: q.questionId, optionId: q.options[0].id }));
      const res = await api.patch(`/api/attempts/${attempt.attemptId}/answers`).set(auth(tokens.student1)).send({ answers });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.answeredCount, 3);
    });

    it('clears an answer with optionId: null', async () => {
      const res = await api
        .patch(`/api/attempts/${attempt.attemptId}/answers`)
        .set(auth(tokens.student1))
        .send({ answers: [{ questionId: attempt.questions[2].questionId, optionId: null }] });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.answeredCount, 2);
    });

    it('rejects a client-supplied score on submit (400)', async () => {
      const res = await api.post(`/api/attempts/${attempt.attemptId}/submit`).set(auth(tokens.student1)).send({ score: 100 });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some((d) => d.field === 'score'));
    });

    it('submits once (200), then blocks a second submission (409)', async () => {
      const first = await api.post(`/api/attempts/${attempt.attemptId}/submit`).set(auth(tokens.student1)).send({});
      assert.equal(first.status, 200);
      assert.equal(first.body.data.status, 'submitted');
      assert.equal(first.body.data.score, undefined, 'manual release must hide the score');

      const second = await api.post(`/api/attempts/${attempt.attemptId}/submit`).set(auth(tokens.student1)).send({});
      assert.equal(second.status, 409);
      assert.equal(second.body.error.code, 'ATTEMPT_ALREADY_SUBMITTED');
    });

    it('blocks answers after submission (409) and a new attempt when the limit is reached (409)', async () => {
      const save = await api
        .patch(`/api/attempts/${attempt.attemptId}/answers`)
        .set(auth(tokens.student1))
        .send({ answers: [{ questionId: attempt.questions[0].questionId, optionId: attempt.questions[0].options[1].id }] });
      assert.equal(save.status, 409);

      const restart = await api.post(`/api/student/exams/${examId('LIVE')}/attempts`).set(auth(tokens.student1));
      assert.equal(restart.status, 409);
      assert.equal(restart.body.error.code, 'MAX_ATTEMPTS_REACHED');
    });

    it('hides the result until faculty publish it (403)', async () => {
      const res = await api.get(`/api/attempts/${attempt.attemptId}/result`).set(auth(tokens.student1));
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'RESULTS_NOT_RELEASED');
    });

    it('scored the attempt on the server', async () => {
      const stored = await models.Attempt.findById(attempt.attemptId);
      assert.ok(stored.evaluation);
      assert.equal(stored.evaluation.breakdown.length, 10);
      assert.equal(stored.evaluation.unattemptedCount, 8);
    });

    it('two simultaneous submissions: exactly one succeeds', async () => {
      const start = await api.post(`/api/student/exams/${examId('LIVE')}/attempts`).set(auth(tokens.student2));
      assert.equal(start.status, 201);
      const id = start.body.data.attemptId;
      const [a, b] = await Promise.all([
        api.post(`/api/attempts/${id}/submit`).set(auth(tokens.student2)).send({}),
        api.post(`/api/attempts/${id}/submit`).set(auth(tokens.student2)).send({}),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    });

    it('auto-submits when a save arrives after deadline + grace (403)', async () => {
      const start = await api.post(`/api/student/exams/${examId('LIVE')}/attempts`).set(auth(tokens.student3));
      assert.equal(start.status, 201);
      const { attemptId, questions } = start.body.data;
      // Simulate the clock running out.
      await models.Attempt.updateOne({ _id: attemptId }, { deadline: new Date(Date.now() - 5 * 60 * 1000) });

      const save = await api
        .patch(`/api/attempts/${attemptId}/answers`)
        .set(auth(tokens.student3))
        .send({ answers: [{ questionId: questions[0].questionId, optionId: questions[0].options[0].id }] });
      assert.equal(save.status, 403);
      assert.equal(save.body.error.code, 'ATTEMPT_TIME_EXPIRED');

      const after = await models.Attempt.findById(attemptId);
      assert.equal(after.status, 'auto_submitted');
      assert.ok(after.evaluation);
    });

    it('cannot publish results before the exam window ends (409)', async () => {
      const res = await api.post(`/api/exams/${examId('LIVE')}/results/publish`).set(auth(tokens.faculty1));
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'EXAM_NOT_ENDED');
    });
  });

  // ------------------------------------------------------------ results and reports
  describe('results and reports', () => {
    it('student sees released results with a breakdown but no answer key', async () => {
      const list = await api.get('/api/student/results').set(auth(tokens.student1));
      assert.equal(list.status, 200);
      const closed = list.body.data.find((r) => r.examTitle === seeded.exams.CLOSED.title);
      assert.ok(closed);

      const res = await api.get(`/api/attempts/${closed.attemptId}/result`).set(auth(tokens.student1));
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data.breakdown));
      assert.ok(!JSON.stringify(res.body).includes('correctOption'));
    });

    it('summary report aggregates the closed exam', async () => {
      const res = await api.get(`/api/reports/exams/${examId('CLOSED')}/summary`).set(auth(tokens.faculty1));
      assert.equal(res.status, 200);
      const { stats, participation, distribution } = res.body.data;
      assert.equal(stats.studentsAttempted, 26);
      assert.equal(participation.eligibleStudents, 31); // 30 seeded + 1 registered in CSE-3B
      assert.ok(stats.highestScore >= stats.lowestScore);
      assert.equal(distribution.reduce((sum, b) => sum + b.students, 0), 26);
    });

    it('section-wise, question-wise and student-wise reports return data', async () => {
      const id = examId('CLOSED');
      const sections = await api.get(`/api/reports/exams/${id}/sections`).set(auth(tokens.faculty1));
      assert.equal(sections.status, 200);
      assert.equal(sections.body.data.sections.length, 3);

      const questions = await api.get(`/api/reports/exams/${id}/questions`).set(auth(tokens.faculty1));
      assert.equal(questions.status, 200);
      assert.equal(questions.body.data.questions.length, 10);

      const students = await api.get(`/api/reports/exams/${id}/students?limit=5`).set(auth(tokens.faculty1));
      assert.equal(students.status, 200);
      assert.equal(students.body.data.items.length, 5);
      assert.equal(students.body.data.items[0].rank, 1);
      assert.equal(students.body.meta.total, 26);
    });

    it('admin can read audit logs; login events were recorded', async () => {
      const res = await api.get('/api/audit-logs?action=LOGIN_SUCCESS').set(auth(tokens.admin));
      assert.equal(res.status, 200);
      assert.ok(res.body.meta.total >= 1);
    });
  });
});
