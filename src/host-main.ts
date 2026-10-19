import { mountHost } from '@/demo/host/host'
// The demo documents the element, so the page registers it the same way a
// consumer's `import 'hugframe'` does.
import '@/lib/element'
import '@/lib/hugframe.css'
import '@/demo/theme.css'
import '@/site/site.css'
import '@/demo/host/host.css'

const root = document.getElementById('root')

if (root) {
  mountHost(root)
}
