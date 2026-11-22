const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

async function connectDB(uri) {
  await mongoose.connect(uri);
  const { host, port, name } = mongoose.connection;
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[db] connected to mongodb://${host}:${port}/${name}`);
  }
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
