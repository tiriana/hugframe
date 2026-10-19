import { mountChild } from '@/demo/child/child'
import '@/demo/theme.css'
import '@/demo/child/child.css'

// The host sizes the frame to this document's content, so a framed root scrollbar
// would only ever flash during the host's height animation.
if (window.parent !== window) {
  document.documentElement.dataset.hugFramed = 'true'
}

const root = document.getElementById('child-root')

if (root) {
  mountChild(root)
}
