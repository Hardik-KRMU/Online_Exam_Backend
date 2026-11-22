const { Setting } = require('../models');

async function getSettings() {
  return Setting.getSettings();
}

async function updateSettings(data) {
  const settings = await Setting.getSettings();
  Object.assign(settings, data);
  await settings.save();
  return settings;
}

module.exports = { getSettings, updateSettings };
