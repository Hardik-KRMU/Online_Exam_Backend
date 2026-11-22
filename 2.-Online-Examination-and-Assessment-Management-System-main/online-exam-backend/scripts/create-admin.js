#!/usr/bin/env node
/**
 * Command-line tool to create (or promote) an administrator account.
 * Demonstrates the Node.js CLI, process.argv, util.parseArgs and exit codes.
 *
 *   npm run create-admin -- --name "Exam Cell" --email cell@uni.edu --password "Strong@123"
 */
const { parseArgs } = require('util');

const USAGE = 'Usage: npm run create-admin -- --name "Full Name" --email you@example.com --password "Strong@123"';

function readArgs() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        name: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    });
    return values;
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exit(1);
  }
  return {};
}

async function main() {
  const args = readArgs();
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!args.name || !args.email || !args.password) {
    console.error('Missing --name, --email or --password.');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (args.password.length < 8 || !/[A-Z]/.test(args.password) || !/[a-z]/.test(args.password) || !/[0-9]/.test(args.password)) {
    console.error('Password must be 8+ characters with upper-case, lower-case and a digit.');
    process.exitCode = 1;
    return;
  }

  const config = require('../src/config/env');
  const { connectDB, disconnectDB } = require('../src/config/db');
  const { User } = require('../src/models');
  const { ROLES } = require('../src/constants');

  await connectDB(config.mongoUri);
  try {
    const existing = await User.findOne({ email: args.email.toLowerCase() }).select('+password');
    if (existing) {
      existing.role = ROLES.ADMIN;
      existing.section = undefined;
      existing.rollNumber = undefined;
      existing.isActive = true;
      await existing.save();
      console.log(`Existing user ${existing.email} promoted to admin.`);
    } else {
      const user = await User.create({ name: args.name, email: args.email, password: args.password, role: ROLES.ADMIN });
      console.log(`Admin created: ${user.email} (id ${user._id})`);
    }
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
