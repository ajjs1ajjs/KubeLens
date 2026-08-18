export type DiffOp = "equal" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  /** Line content (without trailing newline). */
  text: string;
  /** Line number in the base (for equal/remove). */
  oldLine?: number;
  /** Line number in the new text (for equal/add). */
  newLine?: number;
}

/**
 * Computes a line-based diff between two strings using a simple LCS
 * (longest common subsequence) algorithm. Returns the diff in forward order.
 */
export function diffLines(base: string, next: string): DiffLine[] {
  const a = base.split("\n");
  const b = next.split("\n");

  // Trim a single trailing empty string produced by a final newline.
  if (a.length > 0 && a[a.length - 1] === "") a.pop();
  if (b.length > 0 && b[b.length - 1] === "") b.pop();

  const n = a.length;
  const m = b.length;

  // dp[i][j] = length of LCS of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ op: "equal", text: a[i], oldLine, newLine });
      i++;
      j++;
      oldLine++;
      newLine++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ op: "remove", text: a[i], oldLine });
      i++;
      oldLine++;
    } else {
      result.push({ op: "add", text: b[j], newLine });
      j++;
      newLine++;
    }
  }
  while (i < n) {
    result.push({ op: "remove", text: a[i], oldLine });
    i++;
    oldLine++;
  }
  while (j < m) {
    result.push({ op: "add", text: b[j], newLine });
    j++;
    newLine++;
  }

  return result;
}
