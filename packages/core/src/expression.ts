/**
 * A very small arithmetic language, for lesson blocks that model
 * something rather than plot numbers that were worked out elsewhere.
 *
 * The reason this exists rather than `new Function(...)`:
 *
 * Every block payload in this app is data, never code. That is the
 * whole safety argument for letting a language model write into a
 * lesson -- it cannot emit markup, only values that a component we
 * wrote decides how to draw. An interactive model needs formulas, and a
 * formula is the first thing in any of this that looks like code. Handing
 * a model-authored string to the JavaScript engine would trade that
 * argument away entirely: `eval` and `Function` reach the whole global
 * object, and a lesson body is downstream of ingested web pages, so the
 * string is not only the model's own idea.
 *
 * So the formulas are interpreted here instead. This is a closed
 * grammar -- numbers, the names the block declared, five operators and a
 * short list of functions -- and there is nothing in it that can reach
 * anything. No property access, no calls but the whitelisted ones, no
 * globals, no assignment, no strings. The worst a hostile formula can
 * do is produce the wrong number or no number at all.
 *
 * It is also total: it never throws and never loops. Anything it cannot
 * read is `null`, which the caller prints as prose instead of a plot.
 */

/** What a formula may call. Pure, total, and none of them reach out. */
const FUNCTIONS: Record<string, { arity: number; apply: (args: number[]) => number }> = {
  min: { arity: 2, apply: ([a, b]) => Math.min(a, b) },
  max: { arity: 2, apply: ([a, b]) => Math.max(a, b) },
  abs: { arity: 1, apply: ([a]) => Math.abs(a) },
  sqrt: { arity: 1, apply: ([a]) => Math.sqrt(a) },
  pow: { arity: 2, apply: ([a, b]) => Math.pow(a, b) },
  exp: { arity: 1, apply: ([a]) => Math.exp(a) },
  ln: { arity: 1, apply: ([a]) => Math.log(a) },
  log10: { arity: 1, apply: ([a]) => Math.log10(a) },
  floor: { arity: 1, apply: ([a]) => Math.floor(a) },
  ceil: { arity: 1, apply: ([a]) => Math.ceil(a) },
  round: { arity: 1, apply: ([a]) => Math.round(a) },
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS)

/** Long enough for any honest formula, short enough that nothing
 *  pathological gets as far as the parser. */
const MAX_LENGTH = 500

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'unary'; value: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }

/** Binding power, and whether the operator leans right. Only `^` does. */
const BINDS: Record<string, { power: number; right?: boolean }> = {
  '+': { power: 1 },
  '-': { power: 1 },
  '*': { power: 2 },
  '/': { power: 2 },
  '%': { power: 2 },
  '^': { power: 3, right: true },
}

function tokenise(source: string): Token[] | null {
  const out: Token[] = []
  let i = 0

  while (i < source.length) {
    const c = source[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    if (c >= '0' && c <= '9') {
      // A number, possibly with a fraction and an exponent. Read by
      // hand rather than by regex so the cursor can only ever move
      // forward.
      let j = i
      while (j < source.length && source[j] >= '0' && source[j] <= '9') j++
      if (source[j] === '.') {
        j++
        while (j < source.length && source[j] >= '0' && source[j] <= '9') j++
      }
      if (source[j] === 'e' || source[j] === 'E') {
        let k = j + 1
        if (source[k] === '+' || source[k] === '-') k++
        // Only take the exponent if there are actually digits after it,
        // or `2e` would swallow the `e` and leave nothing to parse.
        if (source[k] >= '0' && source[k] <= '9') {
          while (k < source.length && source[k] >= '0' && source[k] <= '9') k++
          j = k
        }
      }
      const value = Number(source.slice(i, j))
      if (!Number.isFinite(value)) return null
      out.push({ kind: 'number', value })
      i = j
      continue
    }

    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j++
      out.push({ kind: 'name', value: source.slice(i, j) })
      i = j
      continue
    }

    if ('+-*/%^(),'.includes(c)) {
      out.push({ kind: 'op', value: c })
      i++
      continue
    }

    // Anything else -- a quote, a dot, a bracket, a backslash -- is not
    // part of this language. Refusing outright beats skipping it and
    // computing something the formula did not say.
    return null
  }

  return out
}

function parse(tokens: Token[]): Node | null {
  let at = 0

  const peek = () => tokens[at]
  const isOp = (value: string) => {
    const t = peek()
    return t !== undefined && t.kind === 'op' && t.value === value
  }

  /** Pratt: read a leading term, then take operators while they bind
   *  tighter than the level we were called at. */
  function expression(power: number): Node | null {
    let left = leading()
    if (!left) return null

    for (;;) {
      const t = peek()
      if (!t || t.kind !== 'op') break
      const bind = BINDS[t.value]
      if (!bind || bind.power <= power) break
      at++
      // A right-leaning operator recurses at one below its own power,
      // so `2 ^ 3 ^ 2` groups as `2 ^ (3 ^ 2)`.
      const right = expression(bind.right ? bind.power - 1 : bind.power)
      if (!right) return null
      left = { kind: 'binary', op: t.value, left, right }
    }

    return left
  }

  function leading(): Node | null {
    const t = peek()
    if (!t) return null

    if (t.kind === 'number') {
      at++
      return { kind: 'number', value: t.value }
    }

    if (t.kind === 'op' && t.value === '-') {
      at++
      // Binds tighter than * and /, looser than ^: -2^2 is -(2^2), as
      // it is written on paper.
      const value = expression(2)
      return value ? { kind: 'unary', value } : null
    }

    // A leading plus is a no-op, and writing one is not an error.
    if (t.kind === 'op' && t.value === '+') {
      at++
      return expression(2)
    }

    if (t.kind === 'op' && t.value === '(') {
      at++
      const inner = expression(0)
      if (!inner || !isOp(')')) return null
      at++
      return inner
    }

    if (t.kind === 'name') {
      at++
      if (!isOp('(')) return { kind: 'name', value: t.value }

      // A call. The name has to be one of ours: an unknown function is
      // refused here rather than resolved to anything at all.
      const fn = FUNCTIONS[t.value]
      if (!fn) return null
      at++
      const args: Node[] = []
      if (!isOp(')')) {
        for (;;) {
          const arg = expression(0)
          if (!arg) return null
          args.push(arg)
          if (isOp(',')) {
            at++
            continue
          }
          break
        }
      }
      if (!isOp(')')) return null
      at++
      if (args.length !== fn.arity) return null
      return { kind: 'call', name: t.value, args }
    }

    return null
  }

  const tree = expression(0)
  // Trailing tokens mean the formula said more than it parsed, which is
  // a formula nobody should be shown the result of.
  if (!tree || at !== tokens.length) return null
  return tree
}

/** A formula, read once and evaluated many times. */
export interface Formula {
  /** Every name the formula reads. The caller checks it can supply
   *  them before it starts stepping a series. */
  reads: string[]
  evaluate: (scope: Record<string, number>) => number | null
}

/**
 * Read a formula. Returns null where it is not a formula in this
 * language -- unbalanced, an unknown function, a stray character, an
 * assignment, anything at all that is not arithmetic over names.
 */
export function readFormula(source: unknown): Formula | null {
  if (typeof source !== 'string') return null
  if (source.length === 0 || source.length > MAX_LENGTH) return null

  const tokens = tokenise(source)
  if (!tokens || tokens.length === 0) return null

  const tree = parse(tokens)
  if (!tree) return null

  const reads: string[] = []
  const gather = (node: Node) => {
    switch (node.kind) {
      case 'name':
        if (!reads.includes(node.value)) reads.push(node.value)
        break
      case 'unary':
        gather(node.value)
        break
      case 'binary':
        gather(node.left)
        gather(node.right)
        break
      case 'call':
        node.args.forEach(gather)
        break
    }
  }
  gather(tree)

  return {
    reads,
    evaluate: scope => {
      const value = run(tree, scope)
      // Infinity and NaN are answers the caller cannot draw, and are
      // usually a division by a zero the reader put in with a slider.
      // Null says so once, here, rather than at every point of a plot.
      return value !== null && Number.isFinite(value) ? value : null
    },
  }
}

function run(node: Node, scope: Record<string, number>): number | null {
  switch (node.kind) {
    case 'number':
      return node.value

    case 'name': {
      // Own property only: without this, a formula reading `constructor`
      // or `toString` would find something on the prototype chain and
      // the whole closed-grammar argument would be worth nothing.
      if (!Object.prototype.hasOwnProperty.call(scope, node.value)) return null
      const value = scope[node.value]
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }

    case 'unary': {
      const value = run(node.value, scope)
      return value === null ? null : -value
    }

    case 'binary': {
      const left = run(node.left, scope)
      if (left === null) return null
      const right = run(node.right, scope)
      if (right === null) return null
      switch (node.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return right === 0 ? null : left / right
        case '%':
          return right === 0 ? null : left % right
        case '^':
          return Math.pow(left, right)
        default:
          return null
      }
    }

    case 'call': {
      const args: number[] = []
      for (const arg of node.args) {
        const value = run(arg, scope)
        if (value === null) return null
        args.push(value)
      }
      return FUNCTIONS[node.name].apply(args)
    }
  }
}
