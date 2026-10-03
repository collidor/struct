import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-markup'

// Configure Vue SFC grammar with TypeScript script block support
if (Prism.languages.markup && Prism.languages.typescript) {
  Prism.languages.vue = Prism.languages.extend('markup', {})
  Prism.languages.insertBefore('vue', 'tag', {
    script: {
      pattern: /(<script[\s\S]*?>)[\s\S]*?(?=<\/script>)/i,
      lookbehind: true,
      inside: Prism.languages.typescript,
      alias: 'language-typescript',
    },
  })
}

export function highlightCode(code: string, lang = 'typescript'): string {
  if (!code) return ''
  const normalized = lang.toLowerCase()
  
  let grammar = Prism.languages[normalized]
  if (!grammar) {
    if (normalized === 'ts' || normalized === 'tsx') {
      grammar = Prism.languages.typescript
    } else if (normalized === 'js' || normalized === 'jsx') {
      grammar = Prism.languages.javascript
    } else if (normalized === 'sh' || normalized === 'shell') {
      grammar = Prism.languages.bash
    } else if (normalized === 'vue') {
      grammar = Prism.languages.vue || Prism.languages.markup
    } else if (normalized === 'html') {
      grammar = Prism.languages.markup
    } else {
      grammar = Prism.languages.typescript || Prism.languages.clike
    }
  }

  return Prism.highlight(code, grammar, normalized)
}
