<script setup vapor lang="ts">
import CodeBlock from '../components/CodeBlock.vue'
import Callout from '../components/Callout.vue'

const formulaSnippet = `import { parseFormula, evaluateComputed } from '@collidor/struct'

// 1. Parse a formula string into a structured AST
const formulaText = 'items * unitPrice * (1 - discount)'
const ast = parseFormula(formulaText)

console.log(ast)
/*
{
  type: 'binary',
  op: '*',
  left: {
    type: 'binary',
    op: '*',
    left: { type: 'identifier', name: 'items' },
    right: { type: 'identifier', name: 'unitPrice' }
  },
  right: {
    type: 'binary',
    op: '-',
    left: { type: 'literal', value: 1 },
    right: { type: 'identifier', name: 'discount' }
  }
}
*/

// 2. Evaluate in-memory against a context object
const result = evaluateComputed(ast, {
  items: 10,
  unitPrice: 25.5,
  discount: 0.15
})

console.log(result) // => 216.75`

const functionsSnippet = `// The formula engine supports mathematical and logical functions:
const totalFormula = 'round(max(baseFee, items * 2.5) + tax, 2)'
const parsed = parseFormula(totalFormula)

const output = evaluateComputed(parsed, {
  baseFee: 15,
  items: 4,
  tax: 3.25
})

console.log(output) // => 18.25`
</script>

<template>
  <section id="formula-parser" class="docs-section">
    <h2>Formula Parser (Text to AST)</h2>
    <p>
      Parse algebraic and logical expressions directly into type-safe AST nodes without unsafe <code>eval()</code>:
    </p>
    <CodeBlock title="formula-parser.ts" language="typescript" :code="formulaSnippet" />
  </section>

  <section id="computed-evaluator" class="docs-section">
    <h2>Reactive In-Memory Evaluator</h2>
    <p>
      Execute parsed ASTs with variable scoping, arithmetic operators, and built-in math functions (<code>round</code>, <code>min</code>, <code>max</code>, <code>abs</code>):
    </p>
    <CodeBlock title="evaluator.ts" language="typescript" :code="functionsSnippet" />
    <Callout type="tip" title="Safe Execution Sandbox">
      <code>evaluateComputed</code> operates in a strictly isolated environment without access to global objects, prototype chains, or DOM APIs.
    </Callout>
  </section>
</template>

<style scoped>
.docs-section {
  margin-bottom: 3.236em;
}
</style>
