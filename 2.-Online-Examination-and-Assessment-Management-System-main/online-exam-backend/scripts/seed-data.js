/**
 * Static sample data for the seed script. In every question the FIRST option
 * is the correct one; the seed script shuffles options (deterministically) and
 * records the correct option's new position.
 */

const STUDENT_NAMES = [
  'Aarav Mehta', 'Ananya Gupta', 'Rohan Verma', 'Diya Sharma', 'Kabir Singh',
  'Isha Patel', 'Arjun Nair', 'Meera Reddy', 'Vihaan Joshi', 'Saanvi Iyer',
  'Aditya Rao', 'Kavya Menon', 'Ishaan Kapoor', 'Riya Bansal', 'Krishna Pillai',
  'Aisha Khan', 'Dhruv Malhotra', 'Tara Chatterjee', 'Yash Agarwal', 'Nisha Kulkarni',
  'Siddharth Das', 'Pooja Mishra', 'Rahul Saxena', 'Sneha Desai', 'Varun Bhatt',
  'Neha Thakur', 'Aryan Chopra', 'Priya Sinha', 'Karan Arora', 'Zoya Qureshi',
];

const q = (text, options, difficulty = 'easy', marks = 1) => ({ text, options, difficulty, marks });

const BACKEND_QUESTIONS = {
  'node.js fundamentals': [
    q('Which statement best describes Node.js?', ["A JavaScript runtime built on Chrome's V8 engine", 'A front-end JavaScript framework', 'A relational database for JavaScript', 'A browser extension for running JavaScript']),
    q('Which core module creates an HTTP server without Express?', ['http', 'fs', 'path', 'url']),
    q('What does the Node.js event loop make possible?', ['Non-blocking I/O on a single main thread', 'Automatic use of every CPU core', 'Compiling JavaScript ahead of time', 'Synchronous file reading only'], 'medium', 2),
    q('Which object gives access to command-line arguments?', ['process.argv', 'window.args', 'module.args', 'require.argv']),
    q('What is the purpose of package.json?', ['It records project metadata, scripts and dependencies', 'It stores compiled JavaScript', 'It contains environment secrets', 'It configures the MongoDB server']),
    q('Which method reads a file without blocking the event loop?', ['fs.readFile', 'fs.readFileSync', 'fs.openSync', 'fs.statSync'], 'medium', 2),
    q('In CommonJS, how does a module expose a function to other files?', ['module.exports = fn', 'export default fn', 'window.fn = fn', 'global.export(fn)']),
    q('Which core module provides the EventEmitter class?', ['events', 'emitter', 'stream', 'util']),
    q('What does "npm install --save-dev nodemon" do?', ['Adds nodemon to devDependencies', 'Installs nodemon globally', 'Adds nodemon to production dependencies', 'Starts the server with nodemon'], 'medium', 2),
    q('Which callback runs first after the current synchronous code finishes?', ["A resolved Promise's .then callback", 'A setTimeout(fn, 0) callback', 'A setImmediate callback', 'An fs.readFile callback'], 'hard', 2),
  ],
  'express and mvc': [
    q('In Express, what does next() do inside a middleware?', ['Passes control to the next middleware or route handler', 'Ends the response', 'Restarts the server', 'Skips all routes and sends 404']),
    q('Which status code fits a successful resource creation?', ['201 Created', '200 OK', '204 No Content', '302 Found']),
    q('How does Express recognise an error-handling middleware?', ['It has four parameters: (err, req, res, next)', "Its name starts with 'error'", 'It is registered with app.error()', 'It returns a status above 400'], 'medium', 2),
    q('In MVC, which layer holds the database schema definitions?', ['Model', 'View', 'Controller', 'Router']),
    q('Which status code fits a logged-in user who lacks permission?', ['403 Forbidden', '401 Unauthorized', '404 Not Found', '400 Bad Request'], 'medium', 2),
    q('Which built-in middleware parses JSON request bodies?', ['express.json()', 'express.static()', 'express.raw()', 'express.text()']),
    q('What is the main responsibility of a controller in MVC?', ['Handle the request, call business logic and send the response', 'Define database collections', 'Render CSS styles', 'Store environment variables']),
    q('Which HTTP method fits a partial update of a resource?', ['PATCH', 'PUT', 'POST', 'GET'], 'medium', 2),
    q('In Express 4, what happens if an async handler throws and the error is never passed to next()?', ['The error goes unhandled and the request can hang', 'Express sends a 500 automatically', 'The server restarts', 'Express responds 200 and ignores it'], 'hard', 2),
    q('Where does req.params.id come from?', ['A named segment in the route path such as /exams/:id', 'The query string ?id=', 'The JSON body', 'An HTTP header named id']),
    q('Which status code fits registering with an email that already exists?', ['409 Conflict', '500 Internal Server Error', '201 Created', '405 Method Not Allowed'], 'medium', 2),
    q('Why are routes, controllers and services kept in separate files?', ['Separation of concerns makes code easier to test and maintain', 'Express requires one function per file', 'It makes the server faster', 'MongoDB cannot connect otherwise']),
  ],
  'mongodb and mongoose': [
    q('Which aggregation stage filters documents?', ['$match', '$group', '$project', '$sort']),
    q('What does the $lookup stage do?', ['Performs a left outer join with another collection', 'Creates an index', 'Deletes matching documents', 'Renames a collection'], 'medium', 2),
    q('Which Mongoose schema option hides a field from query results by default?', ['select: false', 'hidden: true', 'private: true', 'exclude: true'], 'medium', 2),
    q('What is the main benefit of an index on a frequently queried field?', ['Queries avoid scanning every document', 'Documents use less disk space', 'Writes become faster', 'It enforces a schema']),
    q('Which update operator increments a number atomically?', ['$inc', '$add', '$set', '$push']),
    q("A partial unique index on { exam, student } for status 'in_progress' guarantees what?", ['At most one in-progress attempt per student per exam', 'Each student can sit only one exam ever', 'Every attempt is unique across all exams', 'Attempts can never be deleted'], 'hard', 2),
    q('Which stage groups documents and computes values such as averages?', ['$group', '$unwind', '$limit', '$out']),
    q('What does populate() do in Mongoose?', ['Replaces referenced ObjectIds with the referenced documents', 'Inserts sample data', 'Creates indexes', 'Validates the schema'], 'medium', 2),
    q('What does $unwind do to an array field?', ['Outputs one document per array element', 'Removes the array', 'Sorts the array', 'Converts the array to a string'], 'medium', 2),
    q('Why submit an exam with findOneAndUpdate filtered on status: in_progress?', ['Only one of two simultaneous requests can match and update', 'save() cannot change status', 'It skips schema validation', 'It returns the old document'], 'hard', 2),
  ],
  security: [
    q('Why are passwords hashed with bcrypt instead of encrypted?', ['Hashing is one-way, so stored passwords cannot be reversed', 'bcrypt makes passwords shorter', 'Encryption is slower than hashing', 'bcrypt hides passwords from the client'], 'medium', 2),
    q('What is a salt in password hashing?', ['Random data added so identical passwords get different hashes', 'A secret key shared with the client', 'The number of login attempts allowed', 'A type of JWT claim'], 'medium', 2),
    q('Which part of a JWT proves it was not modified?', ['The signature', 'The header', 'The payload', 'The expiry claim']),
    q('Why should access tokens be short-lived?', ['A stolen token is useful only for a short time', 'Short tokens are faster to send', 'Browsers reject long-lived tokens', 'MongoDB cannot store long tokens']),
    q('Where should JWT secrets be stored?', ['In environment variables, not in source code', 'In the JWT payload', 'In package.json', 'In a public repository']),
    q('What does RBAC stand for?', ['Role-Based Access Control', 'Request-Based API Configuration', 'Remote Backend Access Channel', 'Rule-Bound Authentication Cache']),
    q('What should happen when an already-used refresh token is presented again?', ['Treat it as possible theft and revoke that token family', 'Issue a new access token anyway', 'Ignore it and return 200', 'Extend its expiry'], 'hard', 2),
    q('Which status code means the request has no valid authentication?', ['401 Unauthorized', '403 Forbidden', '400 Bad Request', '429 Too Many Requests']),
    q('Why must exam scores be calculated on the server?', ['A client can be modified to send any score', 'Browsers cannot do arithmetic', 'It reduces network traffic', 'JSON cannot carry numbers'], 'medium', 2),
    q('What does the helmet middleware do?', ['Sets HTTP headers that protect against common web attacks', 'Encrypts the database', 'Hashes passwords', 'Validates request bodies'], 'medium', 2),
  ],
};

const DBMS_QUESTIONS = {
  'sql and normalization': [
    q('Which normal form removes partial dependencies on a composite key?', ['Second Normal Form (2NF)', 'First Normal Form (1NF)', 'Third Normal Form (3NF)', 'Fourth Normal Form (4NF)'], 'medium', 2),
    q('What does the SQL keyword DISTINCT do?', ['Removes duplicate rows from the result', 'Sorts the result', 'Limits the result to one row', 'Joins two tables']),
    q('Which ACID property makes a transaction all-or-nothing?', ['Atomicity', 'Consistency', 'Isolation', 'Durability']),
    q('A primary key must be:', ['Unique and not null', 'Unique but nullable', 'Repeated across rows', 'A text column']),
    q('Which join returns every row of the left table plus matching right rows?', ['LEFT OUTER JOIN', 'INNER JOIN', 'CROSS JOIN', 'SELF JOIN'], 'medium', 2),
    q('What is a foreign key?', ['A column that references the primary key of another table', 'A key used to encrypt a table', 'An index on a text column', 'A key from another database vendor']),
  ],
};

const EXAM_TITLES = Object.freeze({
  CLOSED: 'Node.js Fundamentals Quiz',
  LIVE: 'Express & MVC Mid-Term',
  UPCOMING: 'MongoDB & Mongoose Test',
  SECTION_C_ONLY: 'Security Unit Test',
  DRAFT: 'End-Semester Practice (Draft)',
  OTHER_FACULTY: 'Database Systems Quiz',
});

module.exports = { STUDENT_NAMES, BACKEND_QUESTIONS, DBMS_QUESTIONS, EXAM_TITLES };
