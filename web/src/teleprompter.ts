export type ScriptAnchor = { key: string; line: number };

/** Parse explicit teleprompter anchors, one per line: [[slide:key]]. */
export function parseAnchors(script: string): ScriptAnchor[] {
  return script.split(/\r?\n/).flatMap((line, index) => {
    const match = line.trim().match(/^\[\[slide:([^\]\s]+)\]\]$/);
    return match ? [{ key: match[1], line: index }] : [];
  });
}
