import { mountHost } from '@/demo/host/host'
import 'hugframe'
import 'hugframe/css'
import '@/demo/theme.css'
import '@/site/site.css'
import '@/demo/host/host.css'

const root = document.getElementById('root')

if (root) {
  mountHost(root)
}
