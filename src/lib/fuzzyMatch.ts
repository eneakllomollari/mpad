export function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const lq = query.toLowerCase();
  const lt = target.toLowerCase();

  // Exact substring — high score, prefer matches near end (filename)
  const idx = lt.lastIndexOf(lq);
  if (idx !== -1) return { match: true, score: 1000 - idx };

  // Character-by-character fuzzy
  let qi = 0;
  let score = 0;
  let lastMatch = -1;

  for (let ti = 0; ti < lt.length && qi < lq.length; ti++) {
    if (lt[ti] === lq[qi]) {
      score += lastMatch === ti - 1 ? 10 : 1;
      if (ti === 0 || lt[ti - 1] === '/' || lt[ti - 1] === '-' || lt[ti - 1] === '_') score += 5;
      lastMatch = ti;
      qi++;
    }
  }

  return qi === lq.length ? { match: true, score } : { match: false, score: 0 };
}

export interface FilterResult {
  type: 'command' | 'file';
  label: string;
  hint?: string;
  score: number;
  id: string;
}

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export function filterItems(
  query: string,
  commands: PaletteCommand[],
  files: string[],
  limit: number,
): FilterResult[] {
  const results: FilterResult[] = [];

  // Empty query: show all commands as quick actions
  if (!query.trim()) {
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      results.push({
        type: 'command',
        label: cmd.label,
        hint: cmd.shortcut,
        score: commands.length - i,
        id: cmd.id,
      });
    }
    if (results.length > limit) results.length = limit;
    return results;
  }

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const m = fuzzyMatch(query, cmd.label);
    if (m.match) {
      results.push({
        type: 'command',
        label: cmd.label,
        hint: cmd.shortcut,
        score: m.score + 2000,
        id: cmd.id,
      });
    }
  }

  for (let i = 0; i < files.length; i++) {
    const path = files[i];
    const m = fuzzyMatch(query, path);
    if (m.match) {
      const lastSlash = path.lastIndexOf('/');
      results.push({
        type: 'file',
        label: lastSlash >= 0 ? path.slice(lastSlash + 1) : path,
        hint: lastSlash >= 0 ? path.slice(0, lastSlash) : undefined,
        score: m.score,
        id: path,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  if (results.length > limit) results.length = limit;
  return results;
}
