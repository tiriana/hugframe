import { mountPlayground } from '@/playground/playground'
import 'hugframe/css'
import '@/demo/theme.css'
import '@/site/site.css'
import '@/playground/playground.css'

const root = document.getElementById('playground-root')

if (root) {
  mountPlayground(root)
}
