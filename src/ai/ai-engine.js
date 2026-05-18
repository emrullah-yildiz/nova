export const AIEngine = {
  generateCode(prompt, existingCode) {
    if (typeof NFLogger !== 'undefined') {
      NFLogger.info('ai-engine', 'generateCode called', { prompt, hasExisting: !!existingCode });
    }

    if (existingCode) {
      const mod = this.tryModify(prompt.toLowerCase().trim(), existingCode);
      if (mod) {
        if (typeof NFLogger !== 'undefined') NFLogger.aiLocalGen(prompt, mod);
        return mod;
      }
    }

    return null;
  },

  tryModify(prompt, existingCode) {
    if (!existingCode) return null;

    const swapMatch = prompt.match(/(?:change|swap|replace|switch)\s+(\w+)\s+(?:to|with|for)\s+(\w+)/);
    if (!swapMatch) return null;

    const opMap = {
      add: '+',
      plus: '+',
      subtract: '-',
      minus: '-',
      multiply: '*',
      times: '*',
      divide: '/',
      power: '**'
    };

    const from = opMap[swapMatch[1]] || swapMatch[1];
    const to = opMap[swapMatch[2]] || swapMatch[2];
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newCode = existingCode.replace(new RegExp(escaped, 'g'), to);

    if (newCode === existingCode) return null;

    return {
      code: newCode,
      explanation: `Replaced **${swapMatch[1]}** with **${swapMatch[2]}**`,
      action: 'replace'
    };
  },

  generateFromDescription() {
    return null;
  }
};
