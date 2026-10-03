import { createVaporApp } from 'vue'
import App from './App.vue'

// Import Collidor UI Styles & Themes
import '@collidor/ui/dist/ui.css'
import '@collidor/ui/themes/jewel-artnouveau.css'
import '@collidor/ui/themes/neumorphic.css'
import '@collidor/ui/themes/rpg-parchment.css'
import '@collidor/ui/themes/troy-strategy.css'

// Import Collidor UI Custom Elements
import '@collidor/ui'

// Import Documentation site styling
import './style.css'

const app = createVaporApp(App)
app.mount('#app')
