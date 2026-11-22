/**
 * Server-side scoring of objective (MCQ) answers. Pure function: no database,
 * no clock except evaluatedAt, so it is fully unit-tested.
 *
 * The client never sends a score. Marks come only from:
 *   - the attempt's question list (marks per question, fixed at start),
 *   - the student's saved answers,
 *   - the answer key loaded on the server.
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function getAnswer(answers, questionId) {
  if (!answers) return null;
  if (typeof answers.get === 'function') return answers.get(questionId) || null; // Map / Mongoose Map
  return answers[questionId] || null; // plain object
}

/**
 * @param {object} input
 * @param {Array<{question: any, marks: number}>} input.questions  questions in the attempt
 * @param {Map|object} input.answers   questionId -> { option }
 * @param {Map<string,string>} input.answerKey  questionId -> correct option id
 * @param {{enabled:boolean, fraction:number}} [input.negativeMarking]
 * @param {number} [input.passPercentage=40]
 */
function evaluateAttempt({ questions, answers, answerKey, negativeMarking, passPercentage = 40 }) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  const penaltyFraction = negativeMarking && negativeMarking.enabled ? Number(negativeMarking.fraction) || 0 : 0;

  const breakdown = questions.map((item) => {
    const questionId = String(item.question);
    const marks = Number(item.marks) || 0;
    maxScore += marks;

    const answer = getAnswer(answers, questionId);
    const selected = answer && answer.option ? String(answer.option) : null;

    if (!selected) {
      unattemptedCount += 1;
      return { question: item.question, selectedOption: null, isCorrect: false, marksAwarded: 0 };
    }

    const correctOption = answerKey.get(questionId);
    const isCorrect = correctOption != null && selected === String(correctOption);
    let marksAwarded;
    if (isCorrect) {
      correctCount += 1;
      marksAwarded = marks;
    } else {
      wrongCount += 1;
      marksAwarded = penaltyFraction > 0 ? -round2(marks * penaltyFraction) : 0;
    }
    score += marksAwarded;
    return { question: item.question, selectedOption: answer.option, isCorrect, marksAwarded };
  });

  // Policy: negative marking can reduce the total to zero, not below it.
  const finalScore = Math.max(0, round2(score));
  const percentage = maxScore > 0 ? round2((finalScore / maxScore) * 100) : 0;

  return {
    score: finalScore,
    maxScore: round2(maxScore),
    percentage,
    correctCount,
    wrongCount,
    unattemptedCount,
    passed: percentage >= passPercentage,
    evaluatedAt: new Date(),
    breakdown,
  };
}

module.exports = { evaluateAttempt, round2 };
