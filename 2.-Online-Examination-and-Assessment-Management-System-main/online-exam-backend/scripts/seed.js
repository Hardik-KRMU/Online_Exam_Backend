/**
 * Seeds a development database so the evaluator can test immediately.
 *
 *   npm run seed
 *
 * WARNING: drops every collection in MONGODB_URI first. Refuses to run when
 * NODE_ENV=production. Randomness is seeded, so every run produces the same
 * data shape (exam times are relative to "now").
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const models = require('../src/models');
const { ROLES, EXAM_STATUS, ATTEMPT_STATUS, RESULT_RELEASE } = require('../src/constants');
const { evaluateAttempt } = require('../src/services/evaluation.service');
const { computeDeadline } = require('../src/utils/examWindow');
const { STUDENT_NAMES, BACKEND_QUESTIONS, DBMS_QUESTIONS, EXAM_TITLES } = require('./seed-data');

const { ObjectId } = mongoose.Types;

const PASSWORDS = Object.freeze({ admin: 'Admin@123', faculty: 'Faculty@123', student: 'Student@123' });
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Small deterministic PRNG (mulberry32) so the seed is reproducible. */
function createRandom(seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randomInt = (max) => Math.floor(rand() * max);
  const shuffle = (items) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return { rand, randomInt, shuffle };
}

async function seedDatabase({ quiet = false } = {}) {
  const log = quiet ? () => {} : (msg) => console.log(`[seed] ${msg}`);
  const { rand, randomInt, shuffle } = createRandom(20261113);
  const now = Date.now();

  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(models).map((Model) => Model.syncIndexes()));
  await models.Setting.getSettings();
  log('database cleared, indexes created');

  // ---- Users (passwords hashed once per role; insertMany skips the save hook) ----
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  const [adminHash, facultyHash, studentHash] = await Promise.all([
    bcrypt.hash(PASSWORDS.admin, rounds),
    bcrypt.hash(PASSWORDS.faculty, rounds),
    bcrypt.hash(PASSWORDS.student, rounds),
  ]);

  const [admin, faculty1, faculty2] = await models.User.insertMany([
    { name: 'System Administrator', email: 'admin@exam.local', password: adminHash, role: ROLES.ADMIN, department: 'Examination Cell' },
    { name: 'Dr. Anita Sharma', email: 'faculty1@exam.local', password: facultyHash, role: ROLES.FACULTY, department: 'CSE' },
    { name: 'Prof. Rajesh Kumar', email: 'faculty2@exam.local', password: facultyHash, role: ROLES.FACULTY, department: 'CSE' },
  ]);

  // ---- Courses and sections ----
  const [backend, dbms] = await models.Course.insertMany([
    {
      code: 'BDEV301',
      title: 'Backend Development',
      department: 'CSE',
      description: 'Node.js, Express.js, MongoDB, Mongoose, security and real-time applications',
      faculty: [faculty1._id],
    },
    {
      code: 'DBMS302',
      title: 'Database Management Systems',
      department: 'CSE',
      description: 'Relational modelling, SQL and normalization',
      faculty: [faculty2._id],
    },
  ]);

  const sections = await models.Section.insertMany(
    ['A', 'B', 'C'].map((letter) => ({
      code: `CSE-3${letter}`,
      name: `B.Tech CSE Year 3, Section ${letter}`,
      department: 'CSE',
      academicYear: '2026-27',
      courses: [backend._id, dbms._id],
    }))
  );
  const [sectionA, sectionB, sectionC] = sections;

  // 10 students per section: student1-10 -> CSE-3A, 11-20 -> CSE-3B, 21-30 -> CSE-3C
  const students = await models.User.insertMany(
    STUDENT_NAMES.map((name, i) => ({
      name,
      email: `student${i + 1}@exam.local`,
      password: studentHash,
      role: ROLES.STUDENT,
      rollNumber: `23CSE${String(i + 1).padStart(3, '0')}`,
      section: sections[Math.floor(i / 10)]._id,
    }))
  );
  log(`users: 1 admin, 2 faculty, ${students.length} students`);

  // ---- Question bank (options shuffled; correct option recorded by id) ----
  const buildQuestions = (bank, course, createdBy) =>
    Object.entries(bank).flatMap(([topic, items]) =>
      items.map((item) => {
        const order = shuffle(item.options.map((_, i) => i));
        const options = order.map((i) => ({ _id: new ObjectId(), text: item.options[i] }));
        return {
          course,
          text: item.text,
          options,
          correctOption: options[order.indexOf(0)]._id,
          marks: item.marks,
          topic,
          difficulty: item.difficulty,
          tags: [topic.split(' ')[0]],
          createdBy,
        };
      })
    );

  const questionDocs = await models.Question.insertMany([
    ...buildQuestions(BACKEND_QUESTIONS, backend._id, faculty1._id),
    ...buildQuestions(DBMS_QUESTIONS, dbms._id, faculty2._id),
  ]);
  const byTopic = {};
  questionDocs.forEach((doc) => {
    byTopic[doc.topic] = byTopic[doc.topic] || [];
    byTopic[doc.topic].push(doc);
  });
  log(`questions: ${questionDocs.length}`);

  // ---- Exams in every state the API handles ----
  const pool = (docs) => docs.map((d) => ({ question: d._id, marks: d.marks }));
  const allSections = sections.map((s) => s._id);
  const base = {
    course: backend._id,
    createdBy: faculty1._id,
    shuffleQuestions: true,
    shuffleOptions: true,
    passPercentage: 40,
    maxAttempts: 1,
    negativeMarking: { enabled: false, fraction: 0.25 },
    resultRelease: RESULT_RELEASE.MANUAL,
    status: EXAM_STATUS.PUBLISHED,
    publishedAt: new Date(now - 10 * DAY),
  };

  const exams = await models.Exam.insertMany([
    {
      ...base,
      title: EXAM_TITLES.CLOSED,
      instructions: 'Closed exam with published results. Used for reports and result viewing.',
      durationMinutes: 30,
      startTime: new Date(now - 7 * DAY),
      endTime: new Date(now - 7 * DAY + 2 * HOUR),
      questions: pool(byTopic['node.js fundamentals']),
      questionsPerAttempt: 8,
      resultsPublished: true,
      resultsPublishedAt: new Date(now - 6 * DAY),
      assignedTo: { sections: allSections, courses: [], students: [] },
    },
    {
      ...base,
      title: EXAM_TITLES.LIVE,
      instructions: '10 questions drawn from a pool of 12. Wrong answers deduct 25% of the question marks.',
      durationMinutes: 45,
      startTime: new Date(now - 15 * MIN),
      endTime: new Date(now + 7 * DAY),
      questions: pool(byTopic['express and mvc']),
      questionsPerAttempt: 10,
      negativeMarking: { enabled: true, fraction: 0.25 },
      assignedTo: { sections: [sectionA._id, sectionB._id], courses: [], students: [] },
      publishedAt: new Date(now - DAY),
    },
    {
      ...base,
      title: EXAM_TITLES.UPCOMING,
      instructions: 'Opens in three days.',
      durationMinutes: 40,
      startTime: new Date(now + 3 * DAY),
      endTime: new Date(now + 3 * DAY + 3 * HOUR),
      questions: pool(byTopic['mongodb and mongoose']),
      questionsPerAttempt: 10,
      assignedTo: { sections: allSections, courses: [], students: [] },
    },
    {
      ...base,
      title: EXAM_TITLES.SECTION_C_ONLY,
      instructions: 'Assigned to CSE-3C only. Two attempts allowed; total score shown immediately.',
      durationMinutes: 20,
      startTime: new Date(now - 30 * MIN),
      endTime: new Date(now + 7 * DAY),
      questions: pool(byTopic.security),
      questionsPerAttempt: 8,
      maxAttempts: 2,
      resultRelease: RESULT_RELEASE.IMMEDIATE,
      assignedTo: { sections: [sectionC._id], courses: [], students: [] },
    },
    {
      ...base,
      title: EXAM_TITLES.DRAFT,
      instructions: 'Draft exam: not visible to students until published.',
      durationMinutes: 60,
      startTime: new Date(now + 10 * DAY),
      endTime: new Date(now + 10 * DAY + 2 * HOUR),
      questions: pool(byTopic.security.slice(0, 5)),
      questionsPerAttempt: 5,
      assignedTo: { sections: [], courses: [], students: [] },
      status: EXAM_STATUS.DRAFT,
      publishedAt: undefined,
    },
    {
      ...base,
      title: EXAM_TITLES.OTHER_FACULTY,
      instructions: "Owned by faculty2. faculty1 must NOT be able to manage it or see its reports.",
      course: dbms._id,
      createdBy: faculty2._id,
      durationMinutes: 15,
      startTime: new Date(now - HOUR),
      endTime: new Date(now + 7 * DAY),
      questions: pool(byTopic['sql and normalization']),
      questionsPerAttempt: 6,
      assignedTo: { sections: [], courses: [dbms._id], students: [] }, // assigned via course
    },
  ]);
  const closedExam = exams[0];
  log(`exams: ${exams.length}`);

  // ---- Evaluated attempts for the closed exam (26 of 30 students attempted) ----
  const answerKey = new Map(questionDocs.map((d) => [String(d._id), String(d.correctOption)]));
  const optionIds = new Map(questionDocs.map((d) => [String(d._id), d.options.map((o) => o._id)]));

  const attempts = students.slice(0, 26).map((student, index) => {
    const ability = 0.35 + rand() * 0.6; // chance of answering a question correctly
    const startedAt = new Date(closedExam.startTime.getTime() + randomInt(60) * MIN);
    const deadline = computeDeadline(startedAt, closedExam.durationMinutes, closedExam.endTime);
    const auto = index % 9 === 4; // a few students ran out of time
    const submittedAt = auto
      ? deadline
      : new Date(Math.min(deadline.getTime(), startedAt.getTime() + (12 + randomInt(15)) * MIN));

    const questions = shuffle(closedExam.questions)
      .slice(0, closedExam.questionsPerAttempt)
      .map((item) => ({
        question: item.question,
        marks: item.marks,
        optionOrder: shuffle(optionIds.get(String(item.question))),
      }));

    const answers = {};
    questions.forEach((item, qi) => {
      if (rand() > 0.92) return; // left unanswered
      const qid = String(item.question);
      const correct = answerKey.get(qid);
      const wrong = item.optionOrder.map(String).filter((o) => o !== correct);
      const chosen = rand() < ability ? correct : wrong[randomInt(wrong.length)];
      answers[qid] = {
        option: new ObjectId(chosen),
        answeredAt: new Date(Math.min(submittedAt.getTime(), startedAt.getTime() + (qi + 1) * 80 * 1000)),
      };
    });

    const evaluation = evaluateAttempt({
      questions,
      answers,
      answerKey,
      negativeMarking: closedExam.negativeMarking,
      passPercentage: closedExam.passPercentage,
    });
    evaluation.evaluatedAt = submittedAt;

    return {
      exam: closedExam._id,
      student: student._id,
      attemptNumber: 1,
      status: auto ? ATTEMPT_STATUS.AUTO_SUBMITTED : ATTEMPT_STATUS.SUBMITTED,
      startedAt,
      deadline,
      submittedAt,
      lastSavedAt: submittedAt,
      questions,
      answers,
      evaluation,
      clientInfo: { ip: '127.0.0.1', userAgent: 'seed-script' },
    };
  });
  await models.Attempt.insertMany(attempts);
  log(`attempts: ${attempts.length} evaluated attempts for "${EXAM_TITLES.CLOSED}"`);

  return {
    users: { admin, faculty1, faculty2, students },
    sections: { sectionA, sectionB, sectionC },
    courses: { backend, dbms },
    exams: Object.fromEntries(Object.entries(EXAM_TITLES).map(([key, title]) => [key, exams.find((e) => e.title === title)])),
  };
}

function printSummary(summary) {
  const { exams } = summary;
  console.log('\n================= SEED COMPLETE =================');
  console.log('Logins (email / password):');
  console.table([
    { role: 'admin', email: 'admin@exam.local', password: PASSWORDS.admin, notes: '' },
    { role: 'faculty', email: 'faculty1@exam.local', password: PASSWORDS.faculty, notes: 'teaches BDEV301, owns 5 exams' },
    { role: 'faculty', email: 'faculty2@exam.local', password: PASSWORDS.faculty, notes: 'teaches DBMS302, owns 1 exam' },
    { role: 'student', email: 'student1@exam.local ... student10', password: PASSWORDS.student, notes: 'section CSE-3A' },
    { role: 'student', email: 'student11@exam.local ... student20', password: PASSWORDS.student, notes: 'section CSE-3B' },
    { role: 'student', email: 'student21@exam.local ... student30', password: PASSWORDS.student, notes: 'section CSE-3C' },
  ]);
  console.log('Exams:');
  console.table(
    Object.values(exams).map((e) => ({
      id: String(e._id),
      title: e.title,
      status: e.status,
      start: e.startTime.toISOString(),
      end: e.endTime.toISOString(),
    }))
  );
}

if (require.main === module) {
  (async () => {
    const config = require('../src/config/env');
    if (config.isProduction) {
      console.error('Refusing to seed: NODE_ENV is production.');
      process.exit(1);
    }
    const { connectDB, disconnectDB } = require('../src/config/db');
    await connectDB(config.mongoUri);
    const summary = await seedDatabase();
    printSummary(summary);
    await disconnectDB();
  })().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}

module.exports = { seedDatabase, PASSWORDS, EXAM_TITLES };
