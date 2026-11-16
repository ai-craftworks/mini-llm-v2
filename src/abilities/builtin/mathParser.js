/**
 * mathParser.js
 * A from-scratch arithmetic expression evaluator (no eval!).
 * Grammar (lowest to highest precedence):
 *   expr   := term (("+" | "-") term)*
 *   term   := unary (("*" | "/" | "%") unary)*
 *   unary  := "-" unary | power
 *   power  := atom ("^" unary)?          (right-associative)
 *   atom   := NUMBER | "(" expr ")"
 */
function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|(.))/gy;
  let m;
  while ((m = re.exec(src)) !== null && m[0] !== "") {
    if (m[1] !== undefined) tokens.push({ type: "num", value: parseFloat(m[1]) });
    else if ("+-*/%^()".includes(m[2])) tokens.push({ type: "op", value: m[2] });
    else throw new Error(`Unexpected character "${m[2]}"`);
  }
  return tokens;
}

function evaluate(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().type === "op" && peek().value === v;

  function expr() {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[pos++].value;
      const right = term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function term() {
    let left = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = tokens[pos++].value;
      const right = unary();
      if ((op === "/" || op === "%") && right === 0) throw new Error("Cannot divide by zero");
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  function unary() {
    if (isOp("-")) { pos++; return -unary(); }
    if (isOp("+")) { pos++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp("^")) { pos++; return Math.pow(base, unary()); }
    return base;
  }
  function atom() {
    const t = tokens[pos++];
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "num") return t.value;
    if (t.value === "(") {
      const v = expr();
      if (!isOp(")")) throw new Error("Missing closing parenthesis");
      pos++;
      return v;
    }
    throw new Error(`Unexpected "${t.value}"`);
  }

  const result = expr();
  if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].value}"`);
  return result;
}

module.exports = { evaluate, tokenize };
