// ── Dynamic System Config ──
// Live, in-memory control panel state. Changed via the admin panel at runtime.
// No redeploy needed. Resets to these defaults on server restart.

const config = {
  warmupBots: true,      // Riley + Alex (the original hosts) enabled
  fakeHumans: false,     // inject "human" persona bots into rooms
  fakeHumansCount: 4,    // how many fake humans to spawn (1-10)
  autoEvict: true,       // fake humans leave when real users arrive
};

function getConfig() {
  return { ...config };
}

function setConfig(patch) {
  if (typeof patch.warmupBots === 'boolean') config.warmupBots = patch.warmupBots;
  if (typeof patch.fakeHumans === 'boolean') config.fakeHumans = patch.fakeHumans;
  if (typeof patch.autoEvict === 'boolean') config.autoEvict = patch.autoEvict;
  if (Number.isFinite(patch.fakeHumansCount)) {
    config.fakeHumansCount = Math.max(1, Math.min(10, Math.round(patch.fakeHumansCount)));
  }
  return getConfig();
}

module.exports = { getConfig, setConfig };
