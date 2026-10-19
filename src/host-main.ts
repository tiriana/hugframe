import { mountHost } from '@/demo/host/host'
import '@/lib/hugframe.css'
import '@/demo/theme.css'
import '@/demo/host/host.css'

const root = document.getElementById('root')

if (root) {
  mountHost(root)
}
