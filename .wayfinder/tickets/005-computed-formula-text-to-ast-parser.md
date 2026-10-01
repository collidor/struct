# 005 - Computed Formula Text to AST Parser

## Question

How should a lightweight text formula tokenizer and operator-precedence parser be implemented to transform mathematical and logical expression strings into `ASTExpression` trees for `evaluateAST`?

## Type

`wayfinder:task`

## Status

Closed

## Completed

2026-10-01

## Resolution

Implemented a zero-dependency lexical tokenizer and Pratt expression parser in `src/computed/expressionParser.ts`:
- Tokenizes numbers, strings (with escape sequences), booleans, null, identifiers, operators, and handles single-line and multi-line comments.
- Parses unary (`-`, `!`), binary arithmetic (`+`, `-`, `*`, `/`, `%`, `**`), comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`), logical operators (`&&`, `||`), and ternary conditionals (`a ? b : c`).
- Supports right-associativity for exponentiation (`**`) and ternary expressions.
- Supports dotted identifier paths (`stats.dexterity`) and function calls (`clamp(hp, 0, max_hp)`).
- Added `extractDependencies(ast)` for automated tracking of referenced identifiers.
- Added `evaluateExpression(source, context)` for direct string formula execution.
- Extended `ComputedPropertiesEngine` with `defineComputed` allowing formula strings or AST expressions, auto-dependency extraction, and overloaded struct-scoped or default-scoped `computeAll`.
- Added test suite with 21 unit tests covering tokenizer, operator precedence, right-associativity, nested ternaries, dotted paths, error messages, dependency extraction, and engine chaining.

## Blocked By

None

## Description

Currently, `evaluateAST` in `src/computed/astEvaluator.ts` successfully executes `ASTExpression` trees in pure memory. However, authoring computed properties requires writing verbose JSON trees by hand:
```ts
{
  type: 'BinaryOp',
  operator: '+',
  left: { type: 'Identifier', name: 'hp' },
  right: { type: 'Literal', value: 10 }
}
```

### Required Actions
- Implement a zero-dependency lexical tokenizer and Pratt / Shunting-Yard expression parser in `src/computed/expressionParser.ts`.
- Support:
  - Numeric, string, boolean literals and property identifiers (`hp`, `stats.dexterity`).
  - Binary arithmetic: `+`, `-`, `*`, `/`, `%`, `**`.
  - Comparisons and logic: `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`.
  - Unary operators: `-`, `!`.
  - Ternary conditional expressions: `a ? b : c`.
  - Built-in math functions: `clamp(val, min, max)`, `floor()`, `ceil()`, `round()`, `abs()`, `min()`, `max()`, `sqrt()`.
- Expose `parseExpression(text: string): ASTExpression`.
- Connect into `ComputedPropertiesEngine` allowing computed property definitions via expression string:
  `engine.defineComputed('effective_hp', 'clamp(base_hp + constitution * 2, 0, max_hp)')`.
- Add test coverage in `src/computed/__tests__/expressionParser.test.ts`.
