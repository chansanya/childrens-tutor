// navigator.clipboard 只在 HTTPS 或 localhost 下可用；通过局域网 http 地址访问时退回 execCommand
export async function copyText(text: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const t = Object.assign(document.createElement('textarea'), { value: text })
  t.style.cssText = 'position:fixed;opacity:0'
  document.body.appendChild(t)
  t.select()
  document.execCommand('copy')
  t.remove()
}
