// ============================================
Nova
// NODEFLOW AI — AI Engine (Few-Shot GPT-Based)

//

// No hardcoded recipes. All code generation goes

// through the LLM with a compact few-shot system prompt.

// Local fallback only for trivial modifications.

// ============================================



const AIEngine = {



  // ── MAIN ENTRY ──

  // Returns {code, explanation, action} or null

  // null means "route to GPT" (the normal path)

  generateCode(prompt, existingCode) {

    NFLogger.info('ai-engine', 'generateCode called', { prompt: prompt, hasExisting: !!existingCode });



    // 1. Try simple modification of existing code (swap operators)

    if (existingCode) {

      var mod = this.tryModify(prompt.toLowerCase().trim(), existingCode);

      if (mod) {

        NFLogger.aiLocalGen(prompt, mod);

        return mod;

      }

    }



    // 2. Everything else → return null so GPT handles it

    return null;

  },



  // ── SIMPLE MODIFICATION ──

  tryModify(p, existingCode) {

    if (!existingCode) return null;

    var swapMatch = p.match(/(?:change|swap|replace|switch)\s+(\w+)\s+(?:to|with|for)\s+(\w+)/);

    if (swapMatch) {

      var opMap = {'add':'+','plus':'+','subtract':'-','minus':'-','multiply':'*','times':'*','divide':'/','power':'**'};

      var from = opMap[swapMatch[1]] || swapMatch[1];

      var to = opMap[swapMatch[2]] || swapMatch[2];

      var escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      var newCode = existingCode.replace(new RegExp(escaped, 'g'), to);

      if (newCode !== existingCode) return { code: newCode, explanation: 'Replaced **' + swapMatch[1] + '** with **' + swapMatch[2] + '**', action: 'replace' };

    }

    return null;

  }

};

