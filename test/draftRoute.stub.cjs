class TalentError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
module.exports = { TalentError, currentSession: async () => ({ sub: 's1' }), profiles: () => ({ draft: async () => { throw new Error('model down'); } }) };
